import { SITE_NAME } from "@/lib/site"

export function SiteFooter() {
  return (
    <footer className="border-border/60 border-t">
      <div className="mx-auto max-w-5xl space-y-3 px-6 py-8 text-foreground/50 text-xs">
        <p>
          <strong className="text-foreground/70">{SITE_NAME}</strong> is an
          independent, community-run directory. It is not affiliated with,
          endorsed by, or maintained by{" "}
          <a
            href="https://paseo.sh"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-3 hover:text-foreground"
          >
            paseo.sh
          </a>
          .
        </p>
        <p className="">
          Every listing is generated automatically from a plugin's own public
          repository — nothing here is reviewed, audited, or vouched for by this
          site. Read a plugin's source before installing it. See each plugin's
          page for details.
        </p>
        <p>
          Join the official Paseo community on{" "}
          <a
            href="https://discord.com/channels/1481169421832814616/1547511972830912593"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-3 hover:text-foreground"
          >
            Discord
          </a>
          .
        </p>
        <p className="mt-3">
          Build with ❤︎⁠ as a joined collaboration by{" "}
          <a
            href="https://github.com/tommerty"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-3 hover:text-foreground"
          >
            Tommerty
          </a>{" "}
          &{" "}
          <a
            href="https://github.com/omercnet"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-3 hover:text-foreground"
          >
            omercnet
          </a>
        </p>
      </div>
    </footer>
  )
}
