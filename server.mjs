#!/usr/bin/env node
/**
 * blb-support MCP server — zero-dep Node ESM
 * JSON-RPC 2.0 over stdio (newline-delimited) + Supabase PostgREST.
 */
import { createInterface } from "node:readline";
import { stdin as input, stdout as output, stderr as log } from "node:process";

const DEFAULT_URL = "https://lsjftwebzivyxgszozom.supabase.co";
const TRIAGE_BASE = "https://www.biglawbear.com/admin/support?issue=";

const SUPABASE_URL = (process.env.SUPABASE_URL || DEFAULT_URL).replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SERVICE_KEY) {
  log.write(
    "FATAL: SUPABASE_SERVICE_ROLE_KEY is required (service role for public.support_issues).\n"
  );
  process.exit(1);
}

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "blb-support", version: "0.1.0" };

/** @typedef {'general'|'security'|'privacy'|'legal'|'firms'|'ai_fairness'|'incidents'|'bug'|'feedback'|'clubs'} Category */
/** @typedef {'new'|'in_progress'|'awaiting_reply'|'resolved'|'spam'} Status */
/** @typedef {'low'|'normal'|'high'|'urgent'} Priority */

/**
 * @param {Record<string, unknown>} row
 * @param {{ includeBody?: boolean }} [opts]
 */
function mapRow(row, opts = {}) {
  const includeBody = opts.includeBody !== false;
  /** @type {Record<string, unknown>} */
  const issue = {
    id: row.id,
    category: row.category,
    subject: row.subject,
    reporter: row.reporter_email ?? null,
    status: row.status,
    priority: row.priority ?? "normal",
    triageUrl: `${TRIAGE_BASE}${row.id}`,
    createdAt: row.created_at,
  };
  if (row.updated_at != null) issue.updatedAt = row.updated_at;
  if (row.owner_email !== undefined) issue.ownerEmail = row.owner_email ?? null;
  if (row.page_url !== undefined) issue.pageUrl = row.page_url ?? null;
  if (includeBody) {
    if (row.body !== undefined) issue.body = row.body;
    if (row.admin_notes !== undefined) issue.adminNotes = row.admin_notes ?? null;
  }
  return issue;
}

function headers(extra = {}) {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
    ...extra,
  };
}

/**
 * @param {string} pathQuery
 * @param {RequestInit} [init]
 */
async function rest(pathQuery, init = {}) {
  const url = `${SUPABASE_URL}/rest/v1/${pathQuery}`;
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(), ...(init.headers || {}) },
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && (data.message || data.error || data.hint)
        ? JSON.stringify(data)
        : String(text || res.statusText);
    throw new Error(`Supabase ${res.status} ${init.method || "GET"} ${pathQuery}: ${msg}`);
  }
  return data;
}

const TOOLS = [
  {
    name: "list_support_issues",
    description:
      "List BigLaw Bear support_issues (omit body). Optional filters: status, category, limit (default 20).",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["new", "in_progress", "awaiting_reply", "resolved", "spam"],
        },
        category: {
          type: "string",
          enum: [
            "general",
            "security",
            "privacy",
            "legal",
            "firms",
            "ai_fairness",
            "incidents",
            "bug",
            "feedback",
            "clubs",
          ],
        },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_support_issue",
    description: "Fetch one support issue by id (full SupportIssue including body/adminNotes).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "UUID of support_issues.id" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "mark_support_resolved",
    description:
      "Mark an issue resolved. Sets status=resolved, responded_at=now(), last_admin_action_at=now(). Optional response/adminNotes.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        response: {
          type: "string",
          description: "Optional public/admin response text appended to admin_notes",
        },
        adminNotes: {
          type: "string",
          description: "Optional replacement or note; if response also set, both are recorded",
        },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "escalate_bug_to_builder",
    description:
      "Escalate a support bug to Builder. Warns if category!=bug but still allows. Sets status=in_progress if new, appends ESCALATED_TO_BUILDER line, returns builderSignal for SendToAgent.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
];

async function callTool(name, args = {}) {
  switch (name) {
    case "list_support_issues": {
      const limit = Number.isFinite(args.limit) ? Math.min(100, Math.max(1, args.limit)) : 20;
      const select =
        "id,category,subject,reporter_email,status,priority,created_at,updated_at,owner_email,page_url";
      const params = new URLSearchParams();
      params.set("select", select);
      params.set("order", "created_at.desc");
      params.set("limit", String(limit));
      if (args.status) params.set("status", `eq.${args.status}`);
      if (args.category) params.set("category", `eq.${args.category}`);
      const rows = await rest(`support_issues?${params.toString()}`);
      return (Array.isArray(rows) ? rows : []).map((r) => mapRow(r, { includeBody: false }));
    }
    case "get_support_issue": {
      if (!args.id) throw new Error("id is required");
      const select =
        "id,category,subject,reporter_email,status,priority,created_at,updated_at,owner_email,page_url,body,admin_notes";
      const params = new URLSearchParams();
      params.set("select", select);
      params.set("id", `eq.${args.id}`);
      params.set("limit", "1");
      const rows = await rest(`support_issues?${params.toString()}`);
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(`support_issues id not found: ${args.id}`);
      }
      return mapRow(rows[0], { includeBody: true });
    }
    case "mark_support_resolved": {
      if (!args.id) throw new Error("id is required");
      const now = new Date().toISOString();
      const existingParams = new URLSearchParams();
      existingParams.set("select", "id,admin_notes");
      existingParams.set("id", `eq.${args.id}`);
      existingParams.set("limit", "1");
      const existing = await rest(`support_issues?${existingParams.toString()}`);
      if (!Array.isArray(existing) || existing.length === 0) {
        throw new Error(`support_issues id not found: ${args.id}`);
      }
      let notes = existing[0].admin_notes || "";
      if (args.adminNotes) {
        notes = notes ? `${notes}\n${args.adminNotes}` : args.adminNotes;
      }
      if (args.response) {
        const line = `RESPONSE ${now}: ${args.response}`;
        notes = notes ? `${notes}\n${line}` : line;
      }
      const patch = {
        status: "resolved",
        responded_at: now,
        last_admin_action_at: now,
        admin_notes: notes || null,
      };
      const updated = await rest(`support_issues?id=eq.${encodeURIComponent(args.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const row = Array.isArray(updated) ? updated[0] : updated;
      if (!row) throw new Error("PATCH returned empty representation");
      return mapRow(row, { includeBody: true });
    }
    case "escalate_bug_to_builder": {
      if (!args.id) throw new Error("id is required");
      const select =
        "id,category,subject,reporter_email,status,priority,created_at,updated_at,owner_email,page_url,body,admin_notes";
      const params = new URLSearchParams();
      params.set("select", select);
      params.set("id", `eq.${args.id}`);
      params.set("limit", "1");
      const rows = await rest(`support_issues?${params.toString()}`);
      if (!Array.isArray(rows) || rows.length === 0) {
        throw new Error(`support_issues id not found: ${args.id}`);
      }
      const row = rows[0];
      const warnings = [];
      if (row.category !== "bug") {
        warnings.push(
          `category is '${row.category}' (expected 'bug'); escalating anyway`
        );
      }
      const now = new Date().toISOString();
      const escalateLine = `ESCALATED_TO_BUILDER ${now}`;
      const notes = row.admin_notes
        ? `${row.admin_notes}\n${escalateLine}`
        : escalateLine;
      /** @type {Record<string, unknown>} */
      const patch = {
        admin_notes: notes,
        last_admin_action_at: now,
      };
      if (row.status === "new") patch.status = "in_progress";
      const updated = await rest(`support_issues?id=eq.${encodeURIComponent(args.id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      const out = Array.isArray(updated) ? updated[0] : updated;
      if (!out) throw new Error("PATCH returned empty representation");
      const issue = mapRow(out, { includeBody: true });
      const summary =
        typeof issue.body === "string" && issue.body
          ? String(issue.body).slice(0, 500)
          : String(issue.subject || "");
      const result = {
        issue,
        builderSignal: {
          type: "blb_support_bug",
          issueId: issue.id,
          subject: issue.subject,
          reporter: issue.reporter,
          category: issue.category,
          triageUrl: issue.triageUrl,
          summary,
        },
      };
      if (warnings.length) result.warnings = warnings;
      return result;
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function send(msg) {
  output.write(JSON.stringify(msg) + "\n");
}

function ok(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function fail(id, code, message, data) {
  /** @type {Record<string, unknown>} */
  const err = { code, message };
  if (data !== undefined) err.data = data;
  send({ jsonrpc: "2.0", id, error: err });
}

function toolResult(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

function toolError(message) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  const { id, method, params } = msg;

  // notifications (no id)
  if (id === undefined || id === null) {
    if (method === "notifications/initialized" || method === "initialized") return;
    return;
  }

  try {
    switch (method) {
      case "initialize":
        ok(id, {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: SERVER_INFO,
        });
        break;
      case "ping":
        ok(id, {});
        break;
      case "tools/list":
        ok(id, { tools: TOOLS });
        break;
      case "tools/call": {
        const name = params?.name;
        const args = params?.arguments || {};
        if (!name) {
          ok(id, toolError("tools/call requires params.name"));
          break;
        }
        try {
          const result = await callTool(name, args);
          ok(id, toolResult(result));
        } catch (e) {
          ok(id, toolError(e instanceof Error ? e.message : String(e)));
        }
        break;
      }
      default:
        fail(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    fail(id, -32603, e instanceof Error ? e.message : String(e));
  }
}

const rl = createInterface({ input, crlfDelay: Infinity });
rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try {
    msg = JSON.parse(trimmed);
  } catch (e) {
    log.write(`bad JSON line: ${e}\n`);
    return;
  }
  handle(msg);
});

rl.on("close", () => process.exit(0));
