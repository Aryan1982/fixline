// Starts the five Fixline agents against the room `setup.js` created.
import { CREW, MEMBERS } from "./crew.js";
import { PATHS, PEOPLE, loadState, readEnv, saveState, urls } from "./config.js";
import { Repo } from "./repo.js";
import { SwitchAgent } from "./switch.js";

const env = readEnv();
const base = urls(env);
const state = loadState();
if (!state.roomId) throw new Error("No room yet: run `make setup` first.");

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const repo = new Repo({ path: PATHS.repo, worktrees: PATHS.worktrees });

const ctx = {
  roomId: state.roomId,
  repo,
  log,
  approvers: [PEOPLE.lead.username],
  nextTicket() {
    state.ticketCounter = (state.ticketCounter ?? 0) + 1;
    saveState(state);
    return `FX-${state.ticketCounter}`;
  },
  async knownIssues(agent) {
    const [doc] = await agent.op("load_internal_documents", { ids: [state.docs.knownIssues] });
    return doc?.content ?? "(none)";
  },
  async recordLedger(agent, { ticket, title, sha, approvedBy, minutes, touches }) {
    const [doc] = await agent.op("load_internal_documents", { ids: [state.docs.ledger] });
    const row = `| ${ticket} | ${title.replace(/\|/g, "/")} | \`${sha}\` | @${approvedBy} | ${minutes} min | ${touches} |`;
    await agent.op("update_room_document", { document_id: state.docs.ledger, content: `${(doc?.content ?? "").trimEnd()}\n${row}\n` });
  },
};

const members = CREW.map((spec) => {
  const creds = state.agents[spec.name];
  const agent = new SwitchAgent({ base: base.switch, id: creds.id, apiKey: creds.apiKey, name: spec.name, log });
  return new MEMBERS[spec.role]({ spec, agent, ctx });
});
for (const m of members) await m.start();
log(`crew ready in room ${state.roomId}; ${members.length} agents, waiting for reports`);

const stop = () => {
  for (const m of members) m.agent.close();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
