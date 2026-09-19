import ts from "typescript"
import {
  CATALOG_THEME_MAX_PER_PLUGIN,
  type CatalogThemePreview,
} from "../plugin/shared/catalog"
import { pluginThemePreviewSchema } from "../src/lib/plugin-schema"

type StaticValue = string | StaticValue[] | { [key: string]: StaticValue }
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
  const declarations = new Map<string, ts.Expression>()

  function collectDeclarations(node: ts.Node): void {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      declarations.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, collectDeclarations)
  }
  collectDeclarations(file)

  function evaluate(
    node: ts.Expression,
    scope: ReadonlyMap<string, StaticValue>,
    resolving = new Set<string>()
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
      const scoped = scope.get(node.text)
      if (scoped !== undefined) return scoped
      const initializer = declarations.get(node.text)
      if (!initializer || resolving.has(node.text)) return undefined
      const nextResolving = new Set(resolving)
      nextResolving.add(node.text)
      return evaluate(initializer, scope, nextResolving)
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

  function visit(node: ts.Node, scope: ReadonlyMap<string, StaticValue>): void {
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
          const loopScope = new Map(scope)
          loopScope.set(declaration.name.text, item)
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
  visit(file, new Map())
  return Array.from(
    new Map(previews.map((preview) => [preview.id, preview])).values()
  ).slice(0, CATALOG_THEME_MAX_PER_PLUGIN)
}
