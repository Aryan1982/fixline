// Headless wrappers around the two coding agents the crew is built from.
// Claude Code runs as `claude -p`, Codex as `codex exec`; both work inside a
// git worktree and end with one JSON object we parse out of the final message.
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function run(cmd, args, { cwd, input, timeoutMs = 15 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"], env: process.env });
    let out = "";
    let err = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out);
      else reject(new Error(`${cmd} exited ${code}: ${(err || out).slice(-2000)}`));
    });
    child.stdin.end(input ?? "");
  });
}

/** The last {...} object in a model's final message (fenced or bare). */
export function lastJson(text) {
  const candidates = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/g)]
    .map((m) => m[1])
    .filter((s) => s.startsWith("{"))
    .reverse();
  const end = text.lastIndexOf("}");
  for (let i = end, depth = 0; i >= 0 && end !== -1; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{" && --depth === 0) {
      candidates.push(text.slice(i, end + 1));
      break;
    }
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {}
  }
  throw new Error(`no JSON object in model output: ${text.slice(-500)}`);
}

/**
 * Claude Code, headless. `edit: true` lets it change files in `cwd` and run
 * the test suite; otherwise it can only read.
 */
export async function claude(prompt, { cwd, edit = false, model } = {}) {
  const tools = edit
    ? ["Read", "Grep", "Glob", "Edit", "Write", "Bash(node --test:*)", "Bash(npm test:*)", "Bash(git diff:*)", "Bash(git status:*)"]
    : ["Read", "Grep", "Glob", "Bash(git diff:*)", "Bash(git log:*)"];
  const args = ["-p", "--output-format", "json", "--permission-mode", edit ? "acceptEdits" : "default", "--allowedTools", tools.join(",")];
  if (model) args.push("--model", model);
  const raw = await run("claude", args, { cwd, input: prompt });
  const envelope = JSON.parse(raw);
  if (envelope.is_error) throw new Error(`claude: ${envelope.result}`);
  return { text: envelope.result, costUsd: envelope.total_cost_usd ?? null };
}

/**
 * Codex, headless. `edit: true` uses the workspace-write sandbox, so it can
 * change files under `cwd` and nothing else; otherwise read-only.
 */
export async function codex(prompt, { cwd, edit = false, model } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fixline-codex-"));
  const outFile = join(dir, "last.txt");
  const args = ["exec", "--ephemeral", "--skip-git-repo-check", "-C", cwd, "-s", edit ? "workspace-write" : "read-only", "-o", outFile];
  if (model) args.push("-m", model);
  args.push("-");
  try {
    await run("codex", args, { cwd, input: prompt });
    return { text: readFileSync(outFile, "utf8"), costUsd: null };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const PROVIDERS = { claude, codex };
