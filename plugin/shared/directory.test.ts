import { describe, expect, it } from "vitest"
import type { Artifact, InstalledPlugin } from "./directory"
import {
  countAvailableUpdates,
  DEFAULT_REGISTRY_URL,
  directoryBrowseSettingsEqual,
  directoryBrowseSettingsSchema,
  directoryEntrySchema,
  directorySettings,
  findInstallations,
  formatArtifactRevision,
  getInstallationStateLabel,
  getInstallCommand,
  getReportPluginIssueUrl,
  getSiteUrl,
  getUpdateCommand,
  isDefaultDirectoryBrowseView,
  isTrustedRegistryUrl,
  migrateDirectorySettings,
  sameArtifact,
  setAutomaticUpdatePreference,
} from "./directory"

const npm: Artifact = {
  kind: "npm",
  package: "@acme/example",
  version: "1.0.0",
  resolved: "https://registry.npmjs.org/@acme/example/-/example-1.0.0.tgz",
  integrity: `sha512-${"a".repeat(86)}`,
}
const git: Artifact = {
  kind: "git",
  remote: "https://github.com/acme/plugins.git",
  commit: "a".repeat(40),
  pluginPath: "plugins/example",
}

function installed(overrides: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return {
    id: "example",
    enabled: true,
    status: "running",
    kind: "npm",
    ...overrides,
  }
}

describe("registry URL trust", () => {
  it("accepts HTTPS and loopback HTTP only", () => {
    expect(isTrustedRegistryUrl("https://plugins.paseo.sh")).toBe(true)
    expect(isTrustedRegistryUrl("https://acme.github.io/registry/")).toBe(true)
    expect(isTrustedRegistryUrl("http://localhost:8080")).toBe(true)
    expect(isTrustedRegistryUrl("http://127.0.0.1:8080/registry")).toBe(true)
    expect(isTrustedRegistryUrl("http://[::1]:8080")).toBe(true)
    expect(isTrustedRegistryUrl("http://plugins.example.com")).toBe(false)
    expect(isTrustedRegistryUrl("http://127.0.0.1.evil.test")).toBe(false)
    expect(isTrustedRegistryUrl("ftp://plugins.example.com")).toBe(false)
    const withCredentials = new URL("https://plugins.example.com")
    withCredentials.username = "user"
    withCredentials.password = "pass"
    expect(isTrustedRegistryUrl(withCredentials.href)).toBe(false)
    expect(isTrustedRegistryUrl("https://plugins.example.com:99999")).toBe(
      false
    )
    expect(isTrustedRegistryUrl("https://plugins.example.com/?token=x")).toBe(
      false
    )
  })

  it("rejects an untrusted registry in settings", () => {
    const parsed = directorySettings.schema.safeParse({
      registryUrl: "http://plugins.example.com",
    })
    expect(parsed.success).toBe(false)
    expect(directorySettings.schema.parse({}).registryUrl).toBe(
      DEFAULT_REGISTRY_URL
    )
  })
})

describe("install command", () => {
  it("uses the bare id for the official registry, tolerating a trailing slash", () => {
    expect(getInstallCommand(DEFAULT_REGISTRY_URL, "acme/example")).toBe(
      "paseo plugin add acme/example"
    )
    expect(getInstallCommand(`${DEFAULT_REGISTRY_URL}/`, "acme/example")).toBe(
      "paseo plugin add acme/example"
    )
  })

  it("uses the host form for another registry at a host root", () => {
    expect(getInstallCommand("https://plugins.acme.com", "acme/example")).toBe(
      "paseo plugin add plugins.acme.com/acme/example"
    )
    expect(
      getInstallCommand("https://plugins.acme.com:8443", "acme/example")
    ).toBe("paseo plugin add plugins.acme.com:8443/acme/example")
  })

  it("offers none when the daemon could not resolve the registry", () => {
    expect(
      getInstallCommand("https://acme.github.io/registry", "acme/example")
    ).toBeUndefined()
    expect(
      getInstallCommand("http://localhost:8080", "acme/example")
    ).toBeUndefined()
  })

  it("builds official links", () => {
    expect(getSiteUrl("acme/example")).toBe(
      "https://paseo.sh/plugins/acme/example"
    )
    expect(getUpdateCommand("example")).toBe(
      "paseo plugin update example --yes"
    )
    expect(getReportPluginIssueUrl("acme/example")).toBe(
      "https://github.com/getpaseo/plugins/issues/new?title=Report%3A%20acme%2Fexample"
    )
  })
})

describe("listing validation", () => {
  const listing = {
    id: "acme/example",
    name: "Example",
    description: "",
    categories: ["utils"],
    author: { github: "acme" },
    repository: { url: "https://github.com/acme/example" },
    artifact: npm,
    publishedAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  }

  it("accepts an official listing and defaults optional fields", () => {
    const parsed = directoryEntrySchema.parse(listing)
    expect(parsed).toMatchObject({ description: "", media: [] })
    expect(parsed.installs).toBeUndefined()
  })

  it("rejects ids, pins, and media that could redirect an install", () => {
    for (const bad of [
      { id: "no-owner" },
      { id: "Acme/Example" },
      { id: "acme/example; rm" },
      { artifact: { ...npm, integrity: "sha1-abc" } },
      { artifact: { ...git, commit: "main" } },
      { icon: "http://insecure.example/icon.png" },
      { media: ["javascript:alert(1)"] },
    ]) {
      expect(
        directoryEntrySchema.safeParse({ ...listing, ...bad }).success
      ).toBe(false)
    }
  })
})

describe("finding installations", () => {
  const entry = { id: "acme/example", artifact: npm }

  it("matches a registry install by listing id and registry", () => {
    const registry = installed({
      registryId: "acme/example",
      registryUrl: DEFAULT_REGISTRY_URL,
    })
    expect(findInstallations(entry, [registry], DEFAULT_REGISTRY_URL)).toEqual([
      registry,
    ])
    expect(
      findInstallations(entry, [registry], `${DEFAULT_REGISTRY_URL}/`)
    ).toEqual([registry])
  })

  it("does not bind a registry install to another registry or another listing", () => {
    const other = installed({
      registryId: "evil/example",
      registryUrl: DEFAULT_REGISTRY_URL,
    })
    const elsewhere = installed({
      registryId: "acme/example",
      registryUrl: "https://plugins.acme.com",
      packageName: "@acme/example",
    })
    expect(
      findInstallations(entry, [other, elsewhere], DEFAULT_REGISTRY_URL)
    ).toEqual([])
  })

  it("matches an install made before the pivot by npm package", () => {
    const legacy = installed({ packageName: "@acme/example" })
    expect(findInstallations(entry, [legacy], DEFAULT_REGISTRY_URL)).toEqual([
      legacy,
    ])
    expect(
      findInstallations(
        entry,
        [installed({ packageName: "@attacker/example" })],
        DEFAULT_REGISTRY_URL
      )
    ).toEqual([])
  })

  it("matches an install made before the pivot by git remote and plugin path", () => {
    const gitEntry = { id: "acme/example", artifact: git }
    const same = installed({
      kind: "git",
      remote: "git@github.com:Acme/plugins.git",
      pluginPath: "./plugins/example/",
    })
    const otherPath = installed({
      kind: "git",
      remote: "https://github.com/acme/plugins",
      pluginPath: "plugins/other",
    })
    const fork = installed({
      kind: "git",
      remote: "https://github.com/attacker/plugins.git",
      pluginPath: "plugins/example",
    })
    expect(
      findInstallations(gitEntry, [same, otherPath, fork], DEFAULT_REGISTRY_URL)
    ).toEqual([same])
  })

  it("never binds a local directory install by id alone", () => {
    expect(
      findInstallations(
        entry,
        [installed({ kind: "directory", id: "example" })],
        DEFAULT_REGISTRY_URL
      )
    ).toEqual([])
  })
})

describe("artifact comparison", () => {
  it("is equal only for the same pinned bytes", () => {
    expect(sameArtifact(npm, { ...npm })).toBe(true)
    expect(sameArtifact(npm, { ...npm, version: "1.0.1" })).toBe(false)
    expect(
      sameArtifact(npm, { ...npm, integrity: `sha512-${"b".repeat(86)}` })
    ).toBe(false)
    expect(sameArtifact(git, { ...git, commit: "A".repeat(40) })).toBe(true)
    expect(sameArtifact(git, { ...git, commit: "b".repeat(40) })).toBe(false)
    expect(
      sameArtifact(git, { ...git, pluginPath: "./plugins/example/" })
    ).toBe(true)
    expect(
      sameArtifact(git, {
        ...git,
        remote: "https://github.com/attacker/plugins.git",
      })
    ).toBe(false)
    expect(sameArtifact(npm, git)).toBe(false)
  })

  it("formats a revision for display", () => {
    expect(formatArtifactRevision(npm)).toBe("1.0.0")
    expect(formatArtifactRevision(git)).toBe("a".repeat(12))
  })
})

describe("installation state", () => {
  it("labels each update outcome", () => {
    const plugin = installed()
    expect(
      getInstallationStateLabel(plugin, {
        id: "example",
        outcome: "update",
        target: "2.0.0",
      })
    ).toBe("Update available: 2.0.0")
    expect(
      getInstallationStateLabel(plugin, { id: "example", outcome: "current" })
    ).toBe("Up to date")
    expect(
      getInstallationStateLabel(plugin, {
        id: "example",
        outcome: "installed-newer",
      })
    ).toBe("Newer than the registry")
    expect(
      getInstallationStateLabel(plugin, { id: "example", outcome: "error" })
    ).toBe("Update check failed")
    expect(getInstallationStateLabel(plugin, undefined)).toBe(
      "Update status unavailable"
    )
    expect(
      getInstallationStateLabel(installed({ kind: "directory" }), undefined)
    ).toBe("Installed locally")
  })

  it("counts only plugins with an update to apply", () => {
    expect(
      countAvailableUpdates([
        { outcome: "update" },
        { outcome: "current" },
        { outcome: "error" },
        { outcome: "update" },
      ])
    ).toBe(2)
  })
})

describe("settings", () => {
  it("drops retired Cafe settings and keeps browse and opt-outs", () => {
    const migrated = migrateDirectorySettings(
      {
        directoryUrl: "https://paseo.cafe/api/plugins",
        previewOptIns: ["review"],
        pendingSelfUpdate: { installationId: "paseo-cafe" },
        autoUpdateOptOuts: ["review"],
        browse: {
          query: "theme",
          categories: ["productivity"],
          sort: "popular",
          status: "installed",
        },
      },
      4
    )
    const parsed = directorySettings.schema.parse(migrated)

    expect(parsed).toEqual({
      registryUrl: DEFAULT_REGISTRY_URL,
      autoUpdateOptOuts: ["review"],
      browse: {
        query: "theme",
        categories: [],
        sort: "popular",
        status: "installed",
        lastOpenedPluginId: null,
      },
    })
  })

  it("leaves a current document alone", () => {
    const current = { registryUrl: DEFAULT_REGISTRY_URL }
    expect(migrateDirectorySettings(current, 5)).toBe(current)
  })

  it("falls back on unknown browse values instead of invalidating the document", () => {
    expect(
      directoryBrowseSettingsSchema.parse({
        sort: "from-the-future",
        status: "bogus",
      })
    ).toMatchObject({ sort: "updates-first", status: "all" })
  })

  it("compares browse state with set semantics for categories", () => {
    const base = directoryBrowseSettingsSchema.parse({
      categories: ["git", "utils"],
    })
    expect(
      directoryBrowseSettingsEqual(base, {
        ...base,
        categories: ["utils", "git"],
      })
    ).toBe(true)
    expect(
      directoryBrowseSettingsEqual(base, { ...base, categories: ["git"] })
    ).toBe(false)
    expect(directoryBrowseSettingsEqual(base, { ...base, query: "x" })).toBe(
      false
    )
  })

  it("only treats the unfiltered default ordering as the default view", () => {
    const base = directoryBrowseSettingsSchema.parse({})
    expect(isDefaultDirectoryBrowseView(base)).toBe(true)
    expect(isDefaultDirectoryBrowseView({ ...base, query: " " })).toBe(true)
    expect(isDefaultDirectoryBrowseView({ ...base, query: "x" })).toBe(false)
    expect(isDefaultDirectoryBrowseView({ ...base, categories: ["git"] })).toBe(
      false
    )
    expect(isDefaultDirectoryBrowseView({ ...base, sort: "popular" })).toBe(
      false
    )
    expect(isDefaultDirectoryBrowseView({ ...base, status: "installed" })).toBe(
      false
    )
  })

  it("toggles automatic updates through the opt-out list", () => {
    expect(setAutomaticUpdatePreference([], "review", false)).toEqual([
      "review",
    ])
    expect(setAutomaticUpdatePreference(["review"], "review", false)).toEqual([
      "review",
    ])
    expect(
      setAutomaticUpdatePreference(["review", "other"], "review", true)
    ).toEqual(["other"])
  })
})
