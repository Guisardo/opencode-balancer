## Problem Statement

Documentation needs to clearly explain how to configure the plugin for both OpenCode v1 and v2, since the config key differs (`plugin` vs `plugins`).

## Solution

Update README and INSTALL.txt with:
- v1 config example using `plugin` (singular)
- v2 config example using `plugins` (plural)
- Migration note explaining the difference
- Clear version-specific installation instructions

## User Stories

1. As an OpenCode v1 user, I want to see the correct config syntax (`plugin`) so my setup works.

2. As an OpenCode v2 user, I want to see the correct config syntax (`plugins`) so my setup works.

3. As a user migrating from v1 to v2, I want a clear migration note explaining the config change.

4. As an AI agent installing the plugin, I want unambiguous config examples in INSTALL.txt.

## Implementation Decisions

### README.md
- Add "v1/v2 Compatibility" section
- Table showing dual entrypoints: v1 `server`, v2 `setup`, shared logic
- Installation instructions for both versions
- v1 config: `plugin = ["@guisardo/opencode-balancer"]`
- v2 config: `plugins = ["@guisardo/opencode-balancer"]`
- Shared logic explanation (core, hooks, components)
- Hook adapters note (v1→v2 mapping)
- Local testing instructions

### INSTALL.txt
- Update AI agent guide with v1/v2 entrypoints
- v2 config examples using `plugins` key
- Clear version-specific install commands

### Changelog
- Note dual compatibility in release notes

## Testing Decisions

- No automated tests for documentation
- Manual verification: config examples are syntactically correct
- README renders correctly on GitHub/npm

## Out of Scope

- Automated doc validation
- Migration tooling
- Backporting v2 features to v1 docs

## Further Notes

Decision recorded in ticket #16. Partially implemented in PR #14 (README updated). INSTALL.txt and migration note pending. Related to dual entrypoint spec (#17).