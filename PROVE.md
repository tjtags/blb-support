# PROVE — blb-support Agent Plugin

Date: 2026-09-01 (America/New_York) / 2026-09-02 UTC  
Workspace: `/workspace/blb-support-mcp`

## Results

| Step | Result | Notes |
|------|--------|-------|
| 1. Download agent-plugins schemas | **PASS** | `schemas/plugin.schema.json`, `schemas/mcp.schema.json` from `https://agent-plugins.org/schemas/1.0.0/` |
| 2. Validate `plugin.json` | **PASS** | Draft 2020-12 via `jsonschema` (`/workspace/.venv`) |
| 3. Validate `mcp.json` | **PASS** | Same; stdio server + `${PLUGIN_ROOT}` cwd + env mapping |
| 4. `node --check server.mjs` | **PASS** | Syntax OK |
| 5. Fail-loud without `SUPABASE_SERVICE_ROLE_KEY` | **PASS** | Exits 1 with `FATAL: SUPABASE_SERVICE_ROLE_KEY is required…` |
| 6. Smoke MCP initialize + tools/list (+ ping) | **PASS** | Dummy key `test`; 4 tools listed |
| 7. Live `tools/call` PostgREST | **SKIP / BLOCKED** | Needs real `SUPABASE_SERVICE_ROLE_KEY` (not committed) |
| 8. Copy to `~/.cursor/plugins/local/blb-support` | **PASS** | Real directory copy (not symlink): `/home/box/.cursor/plugins/local/blb-support` |

## Smoke detail

```json
{
  "pass": true,
  "initialize": true,
  "serverInfo": { "name": "blb-support", "version": "0.1.0" },
  "toolCount": 4,
  "toolNames": [
    "list_support_issues",
    "get_support_issue",
    "mark_support_resolved",
    "escalate_bug_to_builder"
  ],
  "ping": true
}
```

Command: `node scripts/smoke-mcp.mjs` with `SUPABASE_SERVICE_ROLE_KEY=test`.

## Schema notes

- Official `plugin.schema.json` 1.0.0 has **no** `variables` property and `additionalProperties: false`. Env vars are therefore declared only in `mcp.json` `env` (`${SUPABASE_URL}`, `${SUPABASE_SERVICE_ROLE_KEY}`) and documented in `README.md` / `.env.example`.
- `author: { "name": "tinkabot" }` is schema-valid and included.

## Grok Bot gap

Local install under `~/.cursor/plugins/local` matters for **Cursor IDE** prove/load. **Grok Bot only loads marketplace/dashboard plugins** — it does not pick up `~/.cursor/plugins/local/blb-support`. To use this MCP from Grok Bot, publish or register via the dashboard/marketplace path (out of scope for this scaffold).

## Blockers

1. **Live tools/call** requires a real Supabase service role key for project `lsjftwebzivyxgszozom`. Dummy key is enough for initialize / tools/list / ping only.
2. Grok Bot will not auto-load this local plugin copy.
