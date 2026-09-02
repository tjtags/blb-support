#!/usr/bin/env node
/**
 * Smoke: spawn server.mjs with dummy key; send initialize + tools/list.
 * Expect 4 tools. Does not call live PostgREST.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const serverPath = join(root, "server.mjs");

const child = spawn(process.execPath, [serverPath], {
  cwd: root,
  env: {
    ...process.env,
    SUPABASE_URL: process.env.SUPABASE_URL || "https://lsjftwebzivyxgszozom.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "test",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let buf = "";
const replies = [];

child.stdout.setEncoding("utf8");
child.stdout.on("data", (chunk) => {
  buf += chunk;
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      replies.push(JSON.parse(line));
    } catch (e) {
      console.error("parse fail", line, e);
    }
  }
});

child.stderr.setEncoding("utf8");
child.stderr.on("data", (d) => process.stderr.write(d));

function rpc(id, method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
}

rpc(1, "initialize", {
  protocolVersion: "2024-11-05",
  capabilities: {},
  clientInfo: { name: "smoke", version: "0.0.1" },
});
child.stdin.write(
  JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
);
rpc(2, "tools/list", {});
rpc(3, "ping", {});

setTimeout(() => {
  child.stdin.end();
  child.kill("SIGTERM");

  const init = replies.find((r) => r.id === 1);
  const list = replies.find((r) => r.id === 2);
  const ping = replies.find((r) => r.id === 3);
  const tools = list?.result?.tools || [];
  const names = tools.map((t) => t.name);

  const expected = [
    "list_support_issues",
    "get_support_issue",
    "mark_support_resolved",
    "escalate_bug_to_builder",
  ];
  const pass =
    init?.result?.serverInfo?.name === "blb-support" &&
    tools.length === 4 &&
    expected.every((n) => names.includes(n)) &&
    ping &&
    !ping.error;

  console.log(
    JSON.stringify(
      {
        pass,
        initialize: !!init?.result,
        serverInfo: init?.result?.serverInfo,
        toolCount: tools.length,
        toolNames: names,
        ping: ping?.result !== undefined || ping?.error,
        note: "Live tools/call needs real SUPABASE_SERVICE_ROLE_KEY",
      },
      null,
      2
    )
  );
  process.exit(pass ? 0 : 1);
}, 800);
