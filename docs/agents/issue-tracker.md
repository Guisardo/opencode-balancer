# Issue Tracker: GitHub

This repository uses **GitHub Issues** as its issue tracker.

## Operations

| Operation | Command |
|-----------|---------|
| List issues | `gh issue list --repo Guisardo/opencode-balancer` |
| Create issue | `gh issue create --repo Guisardo/opencode-balancer --title "..." --body "..."` |
| Get issue | `gh issue view --repo Guisardo/opencode-balancer <number>` |
| Update issue | `gh issue edit --repo Guisardo/opencode-balancer <number> --title "..." --body "..."` |
| Close issue | `gh issue close --repo Guisardo/opencode-balancer <number>` |
| Add labels | `gh issue edit --repo Guisardo/opencode-balancer <number> --add-label "..."` |
| Remove labels | `gh issue edit --repo Guisardo/opencode-balancer <number> --remove-label "..."` |
| Comment | `gh issue comment --repo Guisardo/opencode-balancer <number> --body "..."` |

## PRs as a request surface

**Disabled.** External PRs are not automatically pulled into the triage queue. If you want to enable this, set `prsAsRequestSurface: true` in this file and re-run the triage skill.

## Conventions

- Issue numbers are the single source of truth for work items
- Labels follow the vocabulary in `docs/agents/triage-labels.md`
- Use `gh` CLI for all issue operations (authenticated via `gh auth login`)