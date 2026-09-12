## What changed

<!-- Describe the catalog or site change. -->

## Plugin submissions and updates

<!-- Delete this section when the pull request does not change registry/*.json. -->

- [ ] `paseo-plugin.json.id` matches the registry filename.
- [ ] `package.json.version` is a released semantic version, not `0.0.0`.
- [ ] For an existing plugin, `package.json.version` was incremented for this release.
- [ ] The repository and plugin path are public.

The companion catalog uses `package.json.version` as the plugin's update identity. Missing or invalid
versions appear as unavailable. The scanner flags `0.0.0`, because updates cannot be detected until
the maintainer starts incrementing it.

## Verification

<!-- List the commands or scenarios used to verify this change. -->
