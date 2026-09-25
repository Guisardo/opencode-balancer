# Domain Documentation Layout

This repository uses a **single-context** layout.

## Structure

```
<repo-root>/
├── CONTEXT.md          # Primary domain context (required)
├── docs/
│   └── adr/            # Architecture Decision Records
│       ├── 0001-example.md
│       └── ...
└── docs/agents/        # Agent skill configuration (this folder)
    ├── issue-tracker.md
    ├── triage-labels.md
    └── domain.md
```

## Consumer Rules

### For agents reading `CONTEXT.md`

1. **Always read `CONTEXT.md` first** — it contains the project's domain model, terminology, and architectural overview
2. **Read relevant ADRs** from `docs/adr/` when working on related areas — ADRs explain *why* decisions were made
3. **Check `docs/agents/*.md`** for skill-specific configuration (issue tracker, triage labels, etc.)

### For agents writing to domain docs

1. **Update `CONTEXT.md`** when the domain model, terminology, or architecture changes significantly
2. **Create ADRs** in `docs/adr/` for architectural decisions — use the format `NNNN-short-title.md` with the next sequential number
3. **Do not edit `docs/agents/*.md`** directly unless changing skill configuration — re-run `setup-matt-pocock-skills` instead

## ADR Format

```markdown
# ADR NNNN: Short Title

## Status
Proposed | Accepted | Superseded

## Context
What is the issue that we're seeing that is motivating this decision or change?

## Decision
What is the change that we're proposing and/or doing?

## Consequences
What becomes easier or more difficult to do because of this change?
```