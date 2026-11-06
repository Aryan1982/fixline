// One-time, idempotent bootstrap of the Fixline room on a Switch server:
// registers the five agents, seeds the demo's people in Mattermost, creates
// the room with its roles, instructions and documents, and makes @triage the
// room's main agent. Safe to re-run.
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CREW } from "./crew.js";
import { PATHS, PEOPLE, ROOM_NAME, loadState, readEnv, saveState, urls } from "./config.js";
import { Mattermost } from "./mattermost.js";
import { SwitchAgent, createRegistrationKey, gatewayLogin, registerAgent } from "./switch.js";

const ROLE_INSTRUCTIONS = {
  triage: "First stop for every report. Check known-issues, ask at most one question, file FX tickets for new bugs and hand them to @repro. When @ci reports a merge, tell the reporter and draft a customer reply.",
  repro: "Write one failing test that proves the ticket's bug, on the ticket's branch. Never touch src/. Hand it to @ci.",
  fixer: "Fix the root cause in src/ until the whole suite passes. Never edit the locked repro test. Hand it to @ci.",
  reviewer: "Review the fix diff as a second model. Request changes from @fixer only for real defects; otherwise approve to @ci.",
  ci: "Run tests, enforce the repro lock, and ask the engineering lead to approve each merge. Record merges in fix-ledger.",
};

const env = readEnv();
const base = urls(env);
const state = loadState();
const say = (...a) => console.log("•", ...a);

// 1. Agents, owned by the seeded admin (linked to Priya's Mattermost account).
// Anyone in the room may address the crew, except @ci: it merges code, so it
// takes instructions only from its owner and the owner's own agents. Switch
// enforces that, including for who may answer its approval cards.
const POLICIES = {
  "fixline-ci": { rules: [{ users: [], agents: [], owner: true, owner_agents: true }] },
};
const gateway = await gatewayLogin(base.switch, env.GATEWAY_ADMIN_EMAIL, env.GATEWAY_ADMIN_PASSWORD);
for (const spec of CREW) {
  if (!state.agents[spec.name]) {
    state.registrationKey ??= await createRegistrationKey(gateway, "fixline-crew");
    const reg = await registerAgent(base.switch, state.registrationKey, spec, { overwrite: true });
    state.agents[spec.name] = { id: reg.id, apiKey: reg.api_key };
    saveState(state);
    say(`registered @${spec.name}`);
  }
  await gateway.put(`/gateway/agents/${state.agents[spec.name].id}/addressing-policy`, { policy: POLICIES[spec.name] ?? null });
}

// 2. People. Priya is the account the stack seeds (MATTERMOST_USER=priya);
// Sam is created here.
const mmAdmin = await new Mattermost(base.mattermost).login(env.MATTERMOST_ADMIN_USER, env.MATTERMOST_ADMIN_PASSWORD);
const team = await mmAdmin.call("GET", `/teams/name/${env.MATTERMOST_TEAM_NAME}`);
const lead = await mmAdmin.userByName(PEOPLE.lead.username);
await mmAdmin.call("PUT", `/users/${lead.id}/patch`, { first_name: PEOPLE.lead.first, last_name: PEOPLE.lead.last, position: PEOPLE.lead.role });
state.people ??= {};
state.people.lead = { username: PEOPLE.lead.username, password: env.MATTERMOST_USER_PASSWORD };
let support = await mmAdmin.userByName(PEOPLE.support.username);
if (!support) {
  const password = `Fx-${randomBytes(9).toString("base64url")}`;
  support = await mmAdmin.call("POST", "/users", {
    username: PEOPLE.support.username,
    email: `${PEOPLE.support.username}@fixline.local`,
    password,
    first_name: PEOPLE.support.first,
    last_name: PEOPLE.support.last,
    position: PEOPLE.support.role,
  });
  state.people.support = { username: PEOPLE.support.username, password };
  say(`created Mattermost user @${PEOPLE.support.username}`);
}
await mmAdmin.call("POST", `/teams/${team.id}/members`, { team_id: team.id, user_id: support.id }).catch(() => {});
saveState(state);

// 3. The room, created by @ci so it carries roles and instructions from birth.
const agentFor = (name) => new SwitchAgent({ base: base.switch, id: state.agents[name].id, apiKey: state.agents[name].apiKey, name });
if (!state.roomId) {
  const ci = agentFor("fixline-ci");
  await ci.connect([]);
  const room = await ci.op("create_room", {
    name: ROOM_NAME,
    description: "Support reports in, reviewed and approved fixes out.",
    agent_names: CREW.map((c) => c.name),
    user_names: [PEOPLE.lead.username, PEOPLE.support.username],
    channel_type: "channel_public",
    instructions: readFileSync(join(PATHS.seed, "room-instructions.md"), "utf8"),
    roles: CREW.map((c) => ({ name: c.role, instructions: ROLE_INSTRUCTIONS[c.role], exclusive: true })),
  });
  ci.close();
  state.roomId = room.id;
  saveState(state);
  say(`created room ${ROOM_NAME} (${room.id})`);
}

// 4. Room documents. Only the creating agent may update one, so each is
// created by the agent that maintains it.
async function ensureDoc(agentName, key, name, description, instructions, file) {
  if (state.docs?.[key]) return;
  const a = agentFor(agentName);
  await a.connect([state.roomId]);
  await a.op("connect_to_room", { room_id: state.roomId });
  const { document_id } = await a.op("create_room_document", {
    name,
    description,
    instructions,
    content: readFileSync(join(PATHS.seed, file), "utf8"),
  });
  a.close();
  state.docs = { ...state.docs, [key]: document_id };
  saveState(state);
  say(`created room document ${name}`);
}
await ensureDoc("fixline-triage", "knownIssues", "known-issues", "Issues already tracked, with customer workarounds", "Check every report against this before filing a ticket.", "known-issues.md");
await ensureDoc("fixline-ci", "ledger", "fix-ledger", "Every merge the crew made and who approved it", "Append one row per merge. Read it to answer what changed and who approved it.", "fix-ledger.md");

// 5. Make @triage the main agent, so support can just type, no @-mention.
const mmLead = await new Mattermost(base.mattermost).login(PEOPLE.lead.username, env.MATTERMOST_USER_PASSWORD);
let channel = null;
for (let i = 0; i < 20 && !channel; i++) {
  channel = await mmLead.channel(ROOM_NAME);
  if (!channel) await new Promise((r) => setTimeout(r, 1000));
}
if (!channel) throw new Error(`Mattermost channel ${ROOM_NAME} not found for ${PEOPLE.lead.username}`);
state.channelId = channel.id;
if (!state.mainAgentAssigned) {
  const sent = await mmLead.post(channel.id, "!assign-agent @fixline-triage");
  let reply = null;
  for (let i = 0; i < 30 && !reply; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    reply = (await mmLead.posts(channel.id, { perPage: 10 })).find((p) => p.create_at > sent.create_at && /assign|Following the conversation/i.test(p.message));
  }
  if (!reply || /isn't switched on/.test(reply.message)) {
    throw new Error(`!assign-agent did not take effect: ${reply?.message ?? "no reply"}. Is FEATURE_FLAGS_ENABLED=follow_the_conversation set in deploy/.env?`);
  }
  state.mainAgentAssigned = true;
  say("assigned @fixline-triage as the room's main agent");
}
saveState(state);

console.log(`
Fixline is set up.
  Mattermost   ${base.mattermost}/${env.MATTERMOST_TEAM_NAME}/channels/${channel.name}
  Priya (lead)   ${PEOPLE.lead.username} / ${env.MATTERMOST_USER_PASSWORD}
  Sam (support)  ${PEOPLE.support.username} / ${state.people.support?.password ?? "(see .fixline/state.json)"}
Next: make crew   (starts the five agents)
`);
process.exit(0);
