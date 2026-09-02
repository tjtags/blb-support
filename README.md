# blb-support (Agent Plugin)

Read/triage BigLaw Bear `public.support_issues` for Clerk ops via a stdio MCP server.

- **Supabase project:** `lsjftwebzivyxgszozom` (common-counsel-v2)
- **API base:** `https://lsjftwebzivyxgszozom.supabase.co`
- **Triage UI:** `https://www.biglawbear.com/admin/support?issue=<id>`

## Layout

```
plugin.json          # Agent Plugins 1.0.0 manifest
mcp.json             # stdio MCP server wiring
server.mjs           # zero-dep Node ESM JSON-RPC MCP + PostgREST
skills/blb-support/SKILL.md
README.md
PROVE.md
.env.example
```

> Note: Agent Plugins `plugin.schema.json` 1.0.0 has **no** `variables` field (`additionalProperties: false`). Env vars are declared in `mcp.json` `env` and documented here.

## Environment

| Variable | Required | Default | Notes |
|----------|----------|---------|-------|
| `SUPABASE_URL` | no | `https://lsjftwebzivyxgszozom.supabase.co` | PostgREST base |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | — | Service role; server exits if missing |

Set these in the Cursor plugin / MCP env UI (or shell when smoke-testing). Never commit real keys.

## MCP tools

1. **`list_support_issues`** — optional `status`, `category`, `limit` (default 20). Returns `SupportIssue[]` without `body`.
2. **`get_support_issue`** — `{ id }` → full `SupportIssue` including `body` / `adminNotes`.
3. **`mark_support_resolved`** — `{ id, response?, adminNotes? }` → sets `status=resolved`, `responded_at=now()`, `last_admin_action_at=now()`.
4. **`escalate_bug_to_builder`** — `{ id }` → if `status=new` → `in_progress`; appends `ESCALATED_TO_BUILDER <iso>` to `admin_notes`; returns `{ issue, builderSignal }`.

### Column map

| DB | Domain |
|----|--------|
| `reporter_email` | `reporter` |
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |
| `page_url` | `pageUrl` |
| `owner_email` | `ownerEmail` |
| `admin_notes` | `adminNotes` |
| (constructed) | `triageUrl` |

## How Clerk calls tools

1. List open work: `list_support_issues` with `status: "new"` (or omit filter).
2. Open one ticket: `get_support_issue` with UUID.
3. Close after reply: `mark_support_resolved` with optional `response` / `adminNotes`.
4. Hand a bug to Builder: `escalate_bug_to_builder`, then SendToAgent Builder with the `builderSignal` payload.

## Escalate → Builder signal shape

```json
{
  "type": "blb_support_bug",
  "issueId": "<uuid>",
  "subject": "...",
  "reporter": "user@example.com",
  "category": "bug",
  "triageUrl": "https://www.biglawbear.com/admin/support?issue=<uuid>",
  "summary": "first ~500 chars of body (or subject)"
}
```

If category ≠ `bug`, the tool warns but still escalates (`warnings` array on the result).

## Local run / smoke

```bash
export SUPABASE_URL=https://lsjftwebzivyxgszozom.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=test   # dummy enough for initialize + tools/list
node server.mjs   # then JSON-RPC lines on stdin; see scripts/smoke-mcp.mjs
```

Live `tools/call` against PostgREST requires a real service role key.

## Cursor IDE install

Copy this directory to `~/.cursor/plugins/local/blb-support` (real directory, not a symlink outside). Grok Bot does **not** load `~/.cursor/plugins/local` — marketplace/dashboard plugins only.
