# Paseo Cafe

Browse the [paseo.cafe](https://paseo.cafe) plugin catalog from inside Paseo, and install
plugins without leaving the app.

The plugin adds a **Paseo Cafe** sidebar surface listing every plugin in the catalog with its
description, categories, platforms, Paseo version requirement, caveats, health checks, and
screenshots. Searching and filtering happen on the client; installing runs `paseo plugin add`
on the daemon host behind a confirmation step. A **Paseo plugin** composer attachment source
lets you attach a plugin's full listing to a prompt when you want an agent to review it before
you trust it.

## Screenshots

### Browse and filter the catalog

![Paseo Cafe catalog with search, sort, installation-state, category, and platform filters](images/catalog-browse.webp)

### Review a plugin before installation

![Paseo Cafe installation review dialog showing the source repository, install command, freshness, health, security status, and caveats](images/install-review.webp)

## Install

```bash
paseo plugin add paseo-cafe/paseo-cafe:plugin
```

Requires a Paseo 0.8 release; the manifest declares `requirements.paseo` as `^0.8.0`.

By default the catalog is read from `https://paseo.cafe/api/plugins`. Point **Settings →
Plugins → Paseo Cafe** at another deployment (a local `bun run dev`, a staging build, or a
self-hosted fork) that serves the same shape. `PASEO_CAFE_DIRECTORY_URL` on the daemon is a
lower-priority fallback for hosts that cannot persist plugin settings.

A custom catalog must use HTTPS, or HTTP on loopback (`localhost`, `*.localhost`,
`127.0.0.0/8`, `[::1]`). The catalog picks which repositories the install button hands to the
`paseo` CLI, so anyone able to rewrite a plaintext response chooses what gets installed on the
daemon host.

Install reporting is enabled by default. **Settings → Plugins → Paseo Cafe → Share approximate
install counts** lets the host owner opt out. When the default catalog opens, Cafe reports listed
plugins already installed on that host once. It subsequently reports newly observed installs,
successful updates when their Git revision changes, and removals detected the next time Cafe
loads. Custom catalogs and entries the daemon cannot verify are not reported.

Each lifecycle report contains exactly the public catalog plugin ID, an event type (`install`,
`update`, or `uninstall`), and a fresh operation nonce used only to deduplicate bounded retries.
The host-scoped settings keep a local plugin-to-revision snapshot so the same state is not
reported on every load; local paths and installation IDs are never sent. Cloudflare necessarily
processes the request IP. Published install counts are therefore approximate events, not unique
users or machines. Disabling reporting records the current inventory locally without reporting
it, so re-enabling does not retroactively report activity from the opted-out period. Revoking
consent cancels pending in-memory reports; there is no persistent retry queue. Removals are only
reported for plugins Cafe previously observed and can confirm are absent on a later load. Cafe
cannot report its own removal because its code is no longer running and its settings are deleted.

Reports go to `https://api.paseo.cafe/v1/events`. A trusted daemon environment may set
`PASEO_CAFE_SERVICE_URL` to another HTTPS service origin, or to an HTTP loopback origin for local
smoke testing. The plugin app cannot choose this destination.

## Limitations

- Plugins listed here are community-submitted and are not vetted by paseo.cafe. They are
  trusted, unsandboxed code on your daemon host: read the source before installing.
- Installing shells out to the `paseo` CLI, so that binary must be on the daemon's `PATH`.
- The composer attachment source always searches the default catalog. Paseo calls an
  attachment search with the query alone, and a plugin's server handler cannot read its own
  settings, so a custom Catalog URL applies to the sidebar surface only.
- Catalog responses are cached on the daemon for five minutes. **Refresh** bypasses that cache.
