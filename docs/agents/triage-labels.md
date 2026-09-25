# Triage Label Vocabulary

This repository uses the **default canonical labels** for the five triage roles.

| Role | Label |
|------|-------|
| Needs triage | `needs-triage` |
| Needs more info | `needs-info` |
| Ready for agent | `ready-for-agent` |
| Ready for human | `ready-for-human` |
| Won't fix | `wontfix` |

These labels are created automatically by the `triage` skill if they don't exist.

## Usage

When the `triage` skill runs, it applies these labels to issues based on their state. The labels are also used as filters in `gh issue list` queries.