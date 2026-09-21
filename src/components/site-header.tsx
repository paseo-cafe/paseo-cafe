import { IconBrandGithub } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { BrandMark } from "@/components/brand-mark"
import { ModeToggle } from "@/components/mode-toggle"
import { useIsMobile } from "@/hooks/use-mobile"
import { HOME_SEARCH_DEFAULT } from "@/lib/catalog-search"
import { SITE_NAME, SITE_REPO } from "@/lib/site"

export function SiteHeader() {
  const isMobile = useIsMobile()

  return (
    <header className="sticky top-0 z-10 border-border border-b bg-background/80 backdrop-blur">
      <div className="page-shell flex items-center justify-between gap-stack py-base">
        <Link
          to="/"
          search={HOME_SEARCH_DEFAULT}
          className="flex flex-col justify-center"
        >
          <span className="type-subheading flex items-center gap-group">
            <BrandMark className="size-5.5 shrink-0" />
            {!isMobile ? SITE_NAME : null}
          </span>
        </Link>
        <nav className="type-body flex items-center gap-base text-muted-foreground">
          <Link
            to="/"
            search={HOME_SEARCH_DEFAULT}
            className="hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Browse
          </Link>
          <Link
            to="/themes"
            className="hover:text-foreground"
            activeProps={{ className: "text-foreground" }}
          >
            Themes
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
            <IconBrandGithub />
          </a>
          <ModeToggle />
        </nav>
      </div>
    </header>
  )
}
