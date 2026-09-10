import { IconBrandGithub, IconPuzzle } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { ModeToggle } from "@/components/mode-toggle"
import { useIsMobile } from "@/hooks/use-mobile"
import { SITE_NAME, SITE_REPO } from "@/lib/site"
import { HOME_SEARCH_DEFAULT } from "@/routes/index"

export function SiteHeader() {
  const isMobile = useIsMobile()

  return (
    <header className="sticky top-0 z-10 border-border/60 border-b bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
        <Link
          to="/"
          search={HOME_SEARCH_DEFAULT}
          className="flex flex-col justify-center"
        >
          <span className="flex items-center gap-2 font-medium">
            <IconPuzzle className="size-5" />
            {!isMobile ? SITE_NAME : null}
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-foreground/70 text-sm">
          <Link
            to="/"
            search={HOME_SEARCH_DEFAULT}
            className="hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Browse
          </Link>
          <Link
            to="/submit"
            className="hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Submit
          </Link>

          <a
            href={`https://github.com/${SITE_REPO}`}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground"
            aria-label="View source on GitHub"
          >
            <IconBrandGithub className="size-5" />
          </a>
          <ModeToggle />
        </nav>
      </div>
    </header>
  )
}
