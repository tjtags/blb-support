---
name: blb-support
description: "WHEN Clerk (or ops) needs to list/triage BigLaw Bear support tickets from the admin board/DB. Use MCP tools list_support_issues, get_support_issue, mark_support_resolved, escalate_bug_to_builder. Never invent ticket data — only report rows returned by tools."
---

# BLB Support Triage

## When to use

- Clerk/ops asks to list, inspect, resolve, or escalate BigLaw Bear `support_issues`.
- User mentions the admin support board (`/admin/support`) or ticket UUIDs.

## Rules

1. **Never invent ticket data.** Only use values returned by MCP tools.
2. Prefer `list_support_issues` first (no body), then `get_support_issue` for full detail.
3. Resolve with `mark_support_resolved` only when ops explicitly wants resolve.
4. For product bugs, call `escalate_bug_to_builder` and forward `builderSignal` to Builder via SendToAgent (type `blb_support_bug`).
5. Treat `SUPABASE_SERVICE_ROLE_KEY` as secret; never print it.

## Tools

| Tool | Purpose |
|------|---------|
| `list_support_issues` | Filter by status/category; default limit 20; no body |
| `get_support_issue` | Full issue by id (body + adminNotes) |
| `mark_support_resolved` | status=resolved + timestamps; optional notes/response |
| `escalate_bug_to_builder` | Annotate + return builderSignal for Builder |

## Domain

`SupportIssue`: id, category, subject, reporter, status, priority, triageUrl, body?, createdAt, updatedAt?, ownerEmail?, pageUrl?, adminNotes?
