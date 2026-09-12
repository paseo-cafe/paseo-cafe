## What changed

<!-- Describe the catalog or site change. -->

## Plugin submissions and registry changes

<!-- Delete this section when the pull request does not change registry/*.json. -->

- [ ] `paseo-plugin.json.id` matches the registry filename.
- [ ] For a new plugin submission, `package.json.version` is a released semantic version, not `0.0.0`.
- [ ] The repository and plugin path are public.

Plugin releases do not require a Paseo Cafe PR. The catalog scanner reads releases from the plugin
repository automatically. The companion catalog uses `package.json.version` as the plugin's update
identity, so maintainers must increment it for each plugin-code release. Missing or invalid versions
appear as unavailable; the scanner flags `0.0.0`.

## Verification

<!-- List the commands or scenarios used to verify this change. -->
