/** Static intro copy at the top of the homepage — no props, nothing dynamic. */
export function HomeHero() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-6 pt-16 pb-2 text-center">
      <div className="mx-auto flex items-center gap-1.5 text-foreground/50 text-xs">
        <span className="size-1.5 rounded-full bg-primary" />
        Community-run unofficial directory
      </div>
      <h1 className="font-semibold text-4xl tracking-tight">
        A directory of paseo.sh plugins
      </h1>
      <p className="mx-auto max-w-xl text-foreground/70">
        Browse community-built{" "}
        <a href="https://paseo.sh" className="underline underline-offset-4">
          Paseo
        </a>{" "}
        plugins. Every listing is generated straight from each plugin's own
        repo — no forms to fill out, just point us at the code.
      </p>
    </div>
  )
}
