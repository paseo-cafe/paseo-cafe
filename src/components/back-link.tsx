import { IconArrowLeft } from "@tabler/icons-react"
import { Link } from "@tanstack/react-router"
import { HOME_SEARCH_DEFAULT } from "@/lib/catalog-search"

/** "← All plugins" link at the top of every page that hangs off the catalog. */
export function BackLink() {
  return (
    <Link
      to="/"
      search={HOME_SEARCH_DEFAULT}
      className="type-body flex w-fit items-center gap-inline text-muted-foreground hover:text-foreground"
    >
      <IconArrowLeft /> All plugins
    </Link>
  )
}
