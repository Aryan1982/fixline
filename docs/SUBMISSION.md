# Submission form answers

Answers for each field of https://www.wemakedevs.org/hackathons/switch/submit, ready to paste.

## Part 1: Project details

**Project title**
Fixline: support reports in, approved fixes out

**Tracks**
Best Business Workflow

**Project description**
Support teams hear about bugs first and can't fix them. Fixline puts a five-agent crew into the support channel through Switch. Sam from support types a customer complaint in plain English. Triage (Claude Code) checks the room's known-issues document and files a ticket. Repro (Codex) writes a failing test. A deterministic CI gate watches the test fail and locks it. Fixer (Claude Code) fixes the code without touching that test. Reviewer (Codex, a different model) reviews the diff. Then CI raises a Switch approval card that only the engineering lead can answer. After the merge, triage tells support what went wrong and drafts a reply for the customer.

In real runs, report to merge took 3.2 to 3.7 minutes for a refund rounding bug. A CSV bug took 6.9 minutes because Codex sent the first fix back for a real regression. Duplicates were answered from the known-issues document without a ticket. Every merge lands in a fix-ledger room document with the time it took and who approved it. Runs locally with make up, make setup, make crew.

**GitHub repository**
https://github.com/Aryan1982/fixline

**Demo video**
https://fixline-iota.vercel.app/media/demo-4x.mp4 (a real run at 4× speed; replace with the narrated YouTube or Loom link once it's recorded)

**Live demo or deployment**
https://fixline-iota.vercel.app

## Part 2: Track details

**Pull requests**: none (not entering Best Core Contribution)

**Blog post**
https://fixline-iota.vercel.app/blog/ for now. The Medium draft is at https://medium.com/p/300fe546b3a1/edit; publish it and paste its public URL here instead.

**Images**: `site/img/og.png`, `docs/img/thread-full.png`, `site/img/approve.png`, `docs/img/gateway-roles.png`

**Wispr usage card**: a screenshot from Wispr Flow Insights, only if you dictated part of the work

**#HowISwitch post**: the URL of the X thread from `docs/SOCIAL.md` once it's posted

## Part 3: How you used Switch

**How did you use Switch in your project?**
Switch is the only thing connecting the agents. One Mattermost channel is a Switch room created with `create_room`. The room carries the instructions, two people (support and the engineering lead), five agents, and five exclusive roles: triage, repro, fixer, reviewer and ci. Each agent is a client of the agent protocol. It registers with `POST /agents`, holds a WebSocket (ping/pong, resume from cursor), calls `connect_to_room` and `assume_role`, and acts only on addressed messages.

Every hand-off is `send_targeted_message` to a role in the ticket's thread. No agent keeps ticket state in memory. Each one rebuilds the ticket with `read_context` on its thread, so a person reading the thread sees exactly what the agents saw. `!assign-agent` makes triage the main agent, so support never types an @-mention. Two room documents do real work: `known-issues` stops duplicates, and `fix-ledger` is the audit trail that CI updates with `update_room_document`.

Merges go through Switch approval cards (`/agent-sessions/{id}/approvals`). The CI agent has an owner-only addressing policy, so Switch itself refuses approvals from anyone but the lead. In every test run, support tried to approve and was ignored. Claude Code and Codex run headless inside a git worktree for each ticket. The CI gate has no model at all.

**What did you like about Switch, and what would you improve?**
Liked: Roles made the design simple. Agents address a job, not each other, and `!roles` shows who holds what. Approval cards are excellent: real buttons in chat, the answerer recorded, the outcome delivered over the socket, and addressing policies deciding who may answer. Treating rooms as logs with `read_context` let the thread be the ticket. Export to YAML in the Gateway is a nice touch.

Would improve:
1. The agent-protocol docs say an agent can call `update_agent_detail` to change its own addressing; on 0.31.0 that returns 403, and the owner has to use `PUT /gateway/agents/{id}/addressing-policy`.
2. On a self-hosted server, `!assign-agent` and follow-ups need `FEATURE_FLAGS_ENABLED=follow_the_conversation`. Without it the command did nothing visible in our run; the setting should be in the quickstart.
3. The bundled Mattermost image is amd64-only. On Apple Silicon under Colima's QEMU it crashed within minutes; a native arm64 build from Mattermost's linux-arm64 tarball fixed it.
4. `list_participants` returns UUIDs, while message senders and approval `answeredBy` use `@switch-…:server` ids, so the two can't be joined.
5. Sending `X-Switch-Connection-Id` before the socket is open gives a 409. A small official JavaScript and Python client would remove most of this friction.
