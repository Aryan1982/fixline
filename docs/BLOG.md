# I put Claude Code and Codex in a support channel and made them check each other's work

*How I built Fixline on Switch's agent protocol, and the six things I wish I'd known on day one.*

Support teams hear about bugs first and can't fix them. Engineers can fix them, but every ticket costs a context switch: read the retelling, reproduce it, fix it, get it reviewed, merge it, then remember to tell support. I wanted to see how much of that loop AI agents could run by themselves if they worked *in the support channel*, next to the people, instead of in someone's terminal.

The result is [Fixline](../README.md). Sam from support types *"a customer returned 2 mugs at $19.99 and was refunded $39.97"* into Mattermost. About four minutes later:

1. **Triage** (Claude Code) has checked the room's known-issues document, found the bug in `src/refund.js`, and filed ticket FX-1.
2. **Repro** (Codex) has written a failing test.
3. **CI** (plain code, no model) has watched that test fail and *locked* it.
4. **Fixer** (Claude Code) has fixed the root cause without touching the locked test.
5. **Reviewer** (Codex, a different model than the one that wrote the fix) has approved it.
6. CI has posted an approval card. Priya, the engineering lead, pressed **Approve**, and the fix is merged.
7. Triage has told Sam what went wrong, and drafted a reply he can paste to the customer.

Sam tried to press Approve too. Switch ignored him.

This post shows how that works on [Switch](https://github.com/sandbox-quantum/switch), and the pitfalls I hit along the way, so your first day goes faster than mine.

## What Switch gives you

Switch connects AI agents to team chat. Every chat channel becomes a **room**, a shared log that people and agents both read from. Agents join it like any other member, with their own name and avatar. On top of the log, a room carries:

- **Instructions** that every agent sees when it connects.
- **Roles**: named jobs such as `reviewer`. Address `@reviewer` and whichever agent holds that role gets the message.
- **Documents**: shared text every member can read, such as a list of known issues.
- **Approval cards**: an agent asks permission, the chat shows buttons, and Switch records who answered.
- **Addressing policies**: who is allowed to give an agent instructions.

Switch ships no agents and no models. You bring both. Switch Console, the desktop app, can run Claude Code, Codex or OpenCode for you. For Fixline I went one level down and wrote all five agents as clients of the [agent protocol](https://docs.switchagents.ai/switch-rooms/internals/agent-protocol): events arrive over a WebSocket, and everything the agent does is an HTTP call. That let me include an agent with no model at all (the CI gate), and it lets anyone reproduce the whole thing with three `make` commands.

## Step 1: run Switch on your laptop

Switch publishes a standalone Docker Compose stack: Postgres, the Switch server, Mattermost as a free chat app, the Gateway admin UI, and a setup container that seeds an admin, a Mattermost user and the Mattermost bridge.

```sh
cp .env.example .env
bash generate-env-secrets.sh .env local     # fills every secret with random values
# set SWITCH_VERSION to a release, e.g. 0.31.0 (there's deliberately no default)
docker compose -f docker-compose.yml --env-file .env --profile collab --profile gateway up -d
curl localhost:8000/health                  # {"status":"ok"}
```

> **Pitfall 1: Mattermost on Apple Silicon.** Mattermost publishes its Docker image for amd64 only. Under Colima's QEMU emulation it ran for a few minutes and then crashed with `fatal error: fault` inside `compress/flate`, and Switch started logging Mattermost timeouts. Mattermost does publish a native `linux-arm64` server tarball, so Fixline builds a ten-line image from it ([`deploy/mattermost-arm64/Dockerfile`](../deploy/mattermost-arm64/Dockerfile)) and the Makefile swaps it in on arm64. After that it never crashed again. Enabling Rosetta in Colima probably works too, but it restarts the VM and every container in it.

> **Pitfall 2: `!assign-agent` silently does nothing.** Follow-ups and main agents sit behind a feature flag on a server you run yourself. Add `FEATURE_FLAGS_ENABLED=follow_the_conversation` to `.env`. With the flag on, the command answers *"From now on, every message here goes to …"*.

## Step 2: register an agent

Registration needs a *registration* key, which you create in the Gateway under **API Keys** or with one call as the admin:

```js
const login = await fetch(`${base}/gateway/auth/login`, { method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email, password }) });
const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const { key } = await (await fetch(`${base}/gateway/api-keys`, { method: "POST",
  headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ label: "my-crew" }) })).json();

const agent = await (await fetch(`${base}/agents`, { method: "POST",
  headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
  body: JSON.stringify({
    name: "fixline-ci", display_name: "CI Gate", description: "Runs tests and gates merges",
    connector_type: "fixline",
    integration_profile: { connection_model: "always_on", message_exchange: true,
      pre_invocation_mediation: [], post_invocation_mediation: [], event_reporting: [] },
  }) })).json();
// agent = { id, api_key }: the key is shown once, so store it
```

The person who created the registration key owns the agent. In the local stack that's the seeded admin, whose account is linked to the seeded Mattermost user, so that Mattermost user is the agent's owner in chat.

> **Pitfall 3: who an agent listens to is the owner's call, not the agent's.** The docs show an agent widening its own audience with the `update_agent_detail` operation. On 0.31.0 that returns `403: An agent can't change its own settings`. The owner sets it through the Gateway instead: `PUT /gateway/agents/{id}/addressing-policy`. `{"policy": null}` opens the agent to anyone in the room. Fixline uses an owner-only rule for the CI gate:
>
> ```json
> { "policy": { "rules": [{ "users": [], "agents": [], "owner": true, "owner_agents": true }] } }
> ```
>
> That one rule is why Sam can't approve merges. Approval cards can only be answered by people the agent takes instructions from, so Switch drops his answer before CI ever sees it.

## Step 3: hold the connection

```js
const ws = new WebSocket(`${wsBase}/agents/${id}/connection/ws?connection_id=${connectionId}&rooms=${roomId}`,
  { headers: { authorization: `Bearer ${apiKey}` } });   // the `ws` package; browsers can't set this header
ws.on("message", (raw) => {
  const frame = JSON.parse(raw);
  if (frame.type === "ping") return ws.send(JSON.stringify({ type: "pong", cursor }));  // always first
  if (typeof frame.id === "number") cursor = Math.max(cursor, frame.id);
  if (frame.event === "message" && frame.data.payload.addressed) handle(frame.data);
});
```

Four rules cover almost everything:

- **Answer pings first.** The server pings every 2 seconds and drops you after 6 seconds of silence. Never let a slow model call sit between a ping and its pong.
- **Keep one `connection_id` for the agent's lifetime** and reconnect with it, plus `start_from=<cursor>`, so missed events replay.
- **Act only on `payload.addressed`.** By default you receive everything in the room.
- **Claim the room when you open the socket** (`rooms=` in the URL), not afterwards, or catch-up events are skipped.

> **Pitfall 4: the connection-id header before the socket is open.** Operations take an optional `X-Switch-Connection-Id` header that binds the call to your room. Send it before the socket's `connection_state` frame arrives and you get `409: connection … is not open`. Send it only once you're connected.

> **Pitfall 5: two kinds of participant id.** `list_participants` returns UUIDs. Message events and approval answers identify the sender as `@switch-mattermost-…:localhost`. They don't match, so you can't join them. I match on `sender_name` for people and on agent names for the crew.

Then post with operations: `POST /agents/{id}/ops/post_message` with `{ body, thread_id }`, or `send_targeted_message` with `target_roles: ["reviewer"]`. Switch adds the `@reviewer` for you and delivers the message to whoever holds the role.

## Step 4: build the room in one call

`create_room` takes everything at once: agents, people (by Mattermost username), instructions, and roles.

```js
await ci.op("create_room", {
  name: "fixline-support", description: "Support reports in, reviewed and approved fixes out.",
  agent_names: ["fixline-triage", "fixline-repro", "fixline-fixer", "fixline-reviewer", "fixline-ci"],
  user_names: ["priya", "sam"], channel_type: "channel_public",
  instructions: roomInstructions,
  roles: ["triage", "repro", "fixer", "reviewer", "ci"].map((name) => ({ name, instructions: roleText[name], exclusive: true })),
});
```

Each agent then calls `connect_to_room` and `assume_role`. Room documents come from `create_room_document`. Only the agent that created a document can update it, so let the agent that owns a document create it: triage owns `known-issues`, CI owns `fix-ledger`.

## Step 5: let a person press the button

This is the part I like best. CI opens a native approval card:

```js
await fetch(`${base}/agent-sessions/${sessionId}/approvals`, { method: "POST", headers: auth, body: JSON.stringify({
  request_id: crypto.randomUUID(), turn_id: crypto.randomUUID(), kind: "approval",
  title: "Merge FX-1 into main: Refunds come out one cent short",
  detail: "3 files changed · tests green · repro locked · reviewed by Codex",
  options: [{ id: "allow", label: "Approve", decision: "accept" }, { id: "deny", label: "Decline", decision: "decline" }],
  questions: [], room_id: roomId, thread_id: threadId, expires_at: null }) });
```

Mattermost shows it with buttons and tags the agent's owner. When someone answers, the card changes to *"Approve · Chosen by @priya from Mattermost"*. The outcome arrives as an `approval_outcome` frame, and `GET /agent-sessions/approvals/outcomes` has it too, in case your socket blinked. `answeredBy` says who answered, so CI can record the approver in the ledger.

> **Pitfall 6: a card mentions the owner by username.** The seeded Mattermost account is called `user`, so my first cards said *"@user Permission needed"*. Set `MATTERMOST_USER=priya` in `.env` before the first `up`; the setup container creates the account with that name.

## What made the crew trustworthy

The models were the easy part. The work went into rules that don't depend on a model behaving:

- **No fix without proof.** CI runs the reproducer's test and only hands off when it fails.
- **The test is locked.** CI records the repro commit in the thread. When the fix comes back, it diffs the branch against that commit, and if the test file changed, the fix is rejected. (Fixers love weakening the test.)
- **Different models check each other.** In one run Codex sent a CSV fix back because `String(value)` turned `null` cells into the text `"null"`. Claude Code fixed it on the next pass.
- **The thread is the ticket.** No agent keeps ticket state in memory. Each one rebuilds the ticket by calling `read_context` on its thread, so a person reading the same thread sees exactly what the agents saw.

## Try it

```sh
git clone https://github.com/Aryan1982/fixline && cd fixline
make up && make setup && make crew
make demo          # in another terminal: Sam reports two problems, Priya approves
```

You need Docker, Node 20+, and the Claude Code and Codex CLIs signed in. The README lists every guard rail and where in the code it lives.
