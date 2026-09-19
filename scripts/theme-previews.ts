import ts from "typescript"
import {
  CATALOG_THEME_MAX_PER_PLUGIN,
  type CatalogThemePreview,
} from "../plugin/shared/catalog"
import { pluginThemePreviewSchema } from "../src/lib/plugin-schema"

type StaticValue = string | StaticValue[] | { [key: string]: StaticValue }

interface StaticBinding {
  initializer: ts.Expression
  scope: StaticScope
}

interface StaticScope {
  parent?: StaticScope
  declarations: Map<string, StaticBinding>
  values: Map<string, StaticValue>
}

const MAX_THEME_SOURCE_LENGTH = 512 * 1_024

/**
 * Extracts literal `client.addTheme(...)` contributions without executing plugin code.
 * The evaluator intentionally understands only static strings, objects, arrays, aliases,
 * and `for ... of` loops, which covers normal theme modules while rejecting computed code.
 */
export function extractThemePreviews(source: string): CatalogThemePreview[] {
  if (source.length > MAX_THEME_SOURCE_LENGTH) return []

  const file = ts.createSourceFile(
    "index.client.tsx",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  )

  function scopeForStatements(
    statements: ts.NodeArray<ts.Statement>,
    parent?: StaticScope
  ): StaticScope {
    const scope: StaticScope = {
      parent,
      declarations: new Map(),
      values: new Map(),
    }
    for (const statement of statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer) {
          scope.declarations.set(declaration.name.text, {
            initializer: declaration.initializer,
            scope,
          })
        }
      }
    }
    return scope
  }

  function evaluate(
    node: ts.Expression,
    scope: StaticScope,
    resolving = new Set<ts.Expression>()
  ): StaticValue | undefined {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text
    }
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    ) {
      return evaluate(node.expression, scope, resolving)
    }
    if (ts.isIdentifier(node)) {
      let current: StaticScope | undefined = scope
      while (current) {
        const value = current.values.get(node.text)
        if (value !== undefined) return value
        const binding = current.declarations.get(node.text)
        if (binding) {
          if (resolving.has(binding.initializer)) return undefined
          const nextResolving = new Set(resolving)
          nextResolving.add(binding.initializer)
          return evaluate(binding.initializer, binding.scope, nextResolving)
        }
        current = current.parent
      }
      return undefined
    }
    if (ts.isArrayLiteralExpression(node)) {
      const values: StaticValue[] = []
      for (const element of node.elements) {
        if (ts.isSpreadElement(element)) {
          const spread = evaluate(element.expression, scope, resolving)
          if (!Array.isArray(spread)) return undefined
          values.push(...spread)
          continue
        }
        const value = evaluate(element, scope, resolving)
        if (value === undefined) return undefined
        values.push(value)
      }
      return values
    }
    if (ts.isObjectLiteralExpression(node)) {
      const value: Record<string, StaticValue> = {}
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = evaluate(property.expression, scope, resolving)
          if (!spread || typeof spread !== "object" || Array.isArray(spread)) {
            return undefined
          }
          Object.assign(value, spread)
          continue
        }
        if (ts.isPropertyAssignment(property)) {
          const name =
            ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)
              ? property.name.text
              : undefined
          if (!name) return undefined
          const propertyValue = evaluate(property.initializer, scope, resolving)
          if (propertyValue === undefined) return undefined
          value[name] = propertyValue
          continue
        }
        if (ts.isShorthandPropertyAssignment(property)) {
          const propertyValue = evaluate(property.name, scope, resolving)
          if (propertyValue === undefined) return undefined
          value[property.name.text] = propertyValue
          continue
        }
        return undefined
      }
      return value
    }
    return undefined
  }

  const previews: CatalogThemePreview[] = []

  function visit(node: ts.Node, scope: StaticScope): void {
    if (ts.isSourceFile(node) || ts.isBlock(node)) {
      const blockScope = scopeForStatements(node.statements, scope)
      for (const statement of node.statements) visit(statement, blockScope)
      return
    }

    if (
      ts.isForOfStatement(node) &&
      ts.isVariableDeclarationList(node.initializer)
    ) {
      const declaration = node.initializer.declarations[0]
      const iterable = evaluate(node.expression, scope)
      if (
        declaration &&
        ts.isIdentifier(declaration.name) &&
        Array.isArray(iterable)
      ) {
        for (const item of iterable) {
          const loopScope: StaticScope = {
            parent: scope,
            declarations: new Map(),
            values: new Map([[declaration.name.text, item]]),
          }
          visit(node.statement, loopScope)
        }
        return
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "addTheme" &&
      node.arguments[0]
    ) {
      const candidate = evaluate(node.arguments[0], scope)
      const parsed = pluginThemePreviewSchema.safeParse(candidate)
      if (parsed.success) previews.push(parsed.data)
    }

    ts.forEachChild(node, (child) => visit(child, scope))
  }

  const rootScope: StaticScope = {
    declarations: new Map(),
    values: new Map(),
  }
  visit(file, rootScope)
  return Array.from(
    new Map(previews.map((preview) => [preview.id, preview])).values()
  ).slice(0, CATALOG_THEME_MAX_PER_PLUGIN)
}
