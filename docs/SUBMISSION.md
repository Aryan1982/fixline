# Submission notes

**Track:** 1, Best Business Workflow. Side tracks: Best Blog ([`BLOG.md`](BLOG.md)) and #HowISwitch ([`SOCIAL.md`](SOCIAL.md)).

**One line:** A support channel where five agents (Claude Code and Codex checking each other, plus a deterministic CI gate) turn a plain-English customer complaint into a fix that has been tested, reviewed and approved by a person, all coordinated through Switch.

**Problem:** Support hears about bugs first and can't fix them. Every bug costs an engineer a retell, a repro, a fix and a review, and support rarely hears how it ended.

**How Switch is used, and why the project stops working without it:**
- Every hand-off is a Switch message addressed to a room role, posted in the ticket's thread. No agent holds ticket state in memory; each rebuilds the ticket by reading the thread with `read_context`.
- The room's main agent (`!assign-agent`) means support never has to @-mention anyone.
- The `known-issues` room document stops duplicates; the `fix-ledger` room document is the audit trail.
- Merges need a Switch approval card. `@ci`'s owner-only addressing policy means Switch itself refuses approvals from anyone but the engineering lead.
- All five agents are agent-protocol clients (WebSocket events, HTTP operations). One of them has no model at all.

**Results from real runs:** report to merge in 3.2–3.7 min for the refund bug, 6.9 min for a CSV bug that went through two reviews, duplicates answered with no ticket filed. See the table in the README.

**Reproduce:** `make up && make setup && make crew`, then `make demo`. Needs Docker, Node 20+, and the Claude Code and Codex CLIs signed in.

**Demo video:** `media/demo-4x.mp4` is a real run at 4× speed. Record the narrated version from [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).
