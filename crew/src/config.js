// Paths, the stack's .env, and the crew's local state (agent keys, room ids).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const STATE_FILE = join(ROOT, ".fixline", "state.json");

export const PATHS = {
  env: join(ROOT, "deploy", ".env"),
  seed: join(ROOT, "crew", "seed"),
  demoApp: join(ROOT, "demo-app"),
  repo: join(ROOT, "workspace", "shopkit"),
  worktrees: join(ROOT, "workspace", "worktrees"),
};

export function readEnv(file = PATHS.env) {
  if (!existsSync(file)) throw new Error(`${file} not found: run \`make up\` first`);
  const env = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

export function urls(env = readEnv()) {
  return {
    switch: process.env.SWITCH_URL ?? `http://localhost:${env.API_HOST_PORT ?? 8000}`,
    mattermost: process.env.MATTERMOST_URL ?? `http://localhost:${env.MATTERMOST_HOST_PORT ?? 8065}`,
    gateway: `http://localhost:${env.GATEWAY_HOST_PORT ?? 3000}`,
  };
}

export function loadState() {
  return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, "utf8")) : { agents: {} };
}

export function saveState(state) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
}

// The people in the demo. Priya is the seeded Mattermost account that is
// linked to the Switch owner, so she owns the agents and approves merges.
export const PEOPLE = {
  lead: { username: "priya", first: "Priya", last: "Shah", role: "Engineering lead" },
  support: { username: "sam", first: "Sam", last: "Rivera", role: "Customer support" },
};

export const ROOM_NAME = "fixline-support";
