export function filterAccessibilityLabel(
  action: "filter" | "clear",
  label: string,
  count?: number
): string {
  const prefix =
    action === "clear" ? `Clear ${label} filter` : `Filter by ${label}`
  return count === undefined ? prefix : `${prefix}, ${count} plugins`
}

export function expandableAccessibilityLabel(
  expanded: boolean,
  title: string,
  subtitle?: string
): string {
  const label = `${expanded ? "Collapse" : "Expand"} ${title}`
  return subtitle ? `${label}, ${subtitle}` : label
}
