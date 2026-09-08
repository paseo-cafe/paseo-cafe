declare module "semver" {
  export function validRange(range: string, options?: { loose?: boolean }): string | null
}
