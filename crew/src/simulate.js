// Plays the people in the demo through the real Mattermost API: Sam from
// support reports customer problems, Priya approves the merge card when it
// appears. Every word goes through Switch exactly as if they had typed it.
//
//   node crew/src/simulate.js                 # both reports, Priya auto-approves
//   node crew/src/simulate.js --manual        # Sam reports; you approve in Mattermost
//   node crew/src/simulate.js --only refund   # one report
//   node crew/src/simulate.js --sam-approves  # Sam tries to approve first (refused)
import { PEOPLE, ROOM_NAME, loadState, readEnv, urls } from "./config.js";
import { Mattermost } from "./mattermost.js";

const REPORTS = {
  refund: "Hey team, a customer (order #4411) returned 2 of the stoneware mugs, $19.99 each. Her refund e-mail says $39.97 but she paid $39.98 for them. She's upset about the missing cent and says it's happened before. Can someone check?",
  discount: "Another one: a customer says the SAVE10 code doesn't work. She typed save10 at checkout and got 'invalid code'.",
  export: "Our accountant says this month's CSV order export is messed up: some rows have the product name split across two columns, so the totals land in the wrong column. It seems to be the rows with the wool socks.",
};

const args = process.argv.slice(2);
const manual = args.includes("--manual");
const samApproves = args.includes("--sam-approves");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : ["refund", "discount"];
const timeoutMin = Number(process.env.FIXLINE_DEMO_TIMEOUT_MIN ?? 40);

const env = readEnv();
const base = urls(env);
const state = loadState();
const sam = await new Mattermost(base.mattermost).login(PEOPLE.support.username, state.people.support.password);
const priya = await new Mattermost(base.mattermost).login(PEOPLE.lead.username, env.MATTERMOST_USER_PASSWORD);
const channel = await sam.channel(ROOM_NAME);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const names = new Map();
const nameOf = async (id) => {
  if (!names.has(id)) names.set(id, (await priya.call("GET", `/users/${id}`)).username);
  return names.get(id);
};

const started = Date.now();
const threads = [];
for (const key of only) {
  const post = await sam.post(channel.id, REPORTS[key]);
  threads.push({ key, root: post.id, seen: new Set(), done: false, answered: new Set() });
  log(`sam → ${key} report`);
  await new Promise((r) => setTimeout(r, 3000));
}

while (threads.some((t) => !t.done)) {
  if (Date.now() - started > timeoutMin * 60_000) {
    log(`timed out after ${timeoutMin} min`);
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 3000));
  for (const t of threads.filter((t) => !t.done)) {
    for (const p of await priya.thread(t.root)) {
      if (t.seen.has(p.id)) continue;
      t.seen.add(p.id);
      const who = await nameOf(p.user_id);
      log(`[${t.key}] ${who}: ${p.message.split("\n").find((l) => l.trim() && !l.startsWith("@")) ?? p.message.split("\n")[0]}`.slice(0, 220));
      const card = p.message.match(/Permission needed\*\* · request `(\w+)`/);
      if (card && !t.answered.has(card[1])) {
        t.answered.add(card[1]);
        if (samApproves) {
          await sam.post(channel.id, `${card[1]} 1`, t.root);
          log(`[${t.key}] sam tries to approve ${card[1]}`);
          await new Promise((r) => setTimeout(r, 6000));
        }
        if (!manual) {
          await new Promise((r) => setTimeout(r, 2000));
          await priya.post(channel.id, `${card[1]} 1`, t.root);
          log(`[${t.key}] priya approves ${card[1]}`);
        } else log(`[${t.key}] waiting for you to approve ${card[1]} in Mattermost`);
      }
      const closes = p.message.includes("Reply you can send the customer") || (t.key === "discount" && /KI-2/.test(p.message));
      if (closes && who === "fixline-triage") t.done = true;
    }
  }
}
log(`all ${threads.length} reports closed in ${((Date.now() - started) / 60_000).toFixed(1)} min`);
process.exit(0);
