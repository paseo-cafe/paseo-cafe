import { IconMoon, IconSun } from "@tabler/icons-react"
import { useTheme } from "@/components/theme-provider"
import { Button } from "@/components/ui/button"

export function ModeToggle() {
  const { theme, setTheme } = useTheme()

  const nextTheme =
    theme === "light" ? "dark" : theme === "dark" ? "system" : "light"
  const iconLabel =
    theme === "light"
      ? "Switch to dark mode"
      : theme === "dark"
        ? "Switch to system preference"
        : "Switch to light mode"

  return (
    <Button
      variant="outline"
      size="icon"
      className="relative"
      onClick={() => setTheme(nextTheme)}
      aria-label={iconLabel}
    >
      <IconSun className="rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <IconMoon className="absolute rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  )
}
