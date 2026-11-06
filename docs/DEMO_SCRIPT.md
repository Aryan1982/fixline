# Demo video script (target: 3 minutes)

Judges score four things: Switch is central, it runs, it solves a real
problem, and the demo makes clear how Switch is used. Every beat below maps to
one of them. Record at 1440×900 or larger, two browser windows side by side:
**Sam** (support) on the left, **Priya** (eng lead) on the right, both in
`fixline-support`. Keep the `make crew` terminal visible in a corner.

Before recording: `make nuke && make up && make setup`, then `make crew`.
Speed up the waiting parts (2–4×) in editing and show a small "4× speed"
label while you do.

| Time | On screen | Voice-over |
|---|---|---|
| 0:00–0:15 | Title card: *Fixline: support reports in, approved fixes out.* Then the empty room. | "Support hears about bugs first and can't fix them. Fixline puts a crew of AI agents into the support channel, using Switch." |
| 0:15–0:30 | `!roles` in the room: five roles, five agents. | "Five agents, each holding a Switch room role. Two are Claude Code, two are Codex, and one is a CI gate with no model at all. They hand work to roles, not to each other." |
| 0:30–0:45 | Sam types the mug refund report, no @-mention. Triage answers within ~60s in a thread with `FX-1`. | "Sam just types. Triage is the room's main agent, so every message reaches it. It checks the code, files FX-1 and tells Sam in plain English." |
| 0:45–1:00 | Sam types *"save10 doesn't work"*. Triage answers with KI-2 and the workaround. Click open the `known-issues` room document. | "Known issues never become tickets. Triage checks the room's known-issues document first." |
| 1:00–1:40 | Scroll the FX-1 thread (speed up): `new ticket` → `repro ready` → 🔴 `repro confirmed` → `fix ready` → 🟢 `review requested` → ✅ `review approved`. Pause on the red test output and the reviewer's line. | "Codex writes a failing test. CI watches it fail, then locks it: if the fixer touches that test, CI rejects the fix. Claude Code fixes the code, and Codex reviews it, so no model grades its own work. The whole ticket lives in this one thread, and every agent reads it from Switch." |
| 1:40–2:05 | The approval card appears in the thread. Sam presses **Approve** first: nothing happens. Priya presses **Approve**: the card flips to *Chosen by @priya*. | "Nothing merges without a person. This is Switch's own approval card. The CI agent only takes instructions from its owner, so Switch ignores Sam's click and accepts Priya's." |
| 2:05–2:30 | `🚀 Merged`, with minutes and human touches. Triage's message to Sam with **Reply you can send the customer**. | "Merged, with the time from report to merge and how many times a human had to step in. Sam gets a customer-ready reply." |
| 2:30–2:45 | Open the `fix-ledger` room document. Then `git log --oneline` in `workspace/shopkit`. | "Every merge is in the fix-ledger document, with who approved it." |
| 2:45–3:00 | Architecture diagram from the README, then the repo URL. | "One `make up`, one `make setup`, one `make crew`. All five agents speak the Switch agent protocol. Fixline." |

## Shots to grab as stills (README, blog, social)

1. The FX-1 thread from Sam's report to `review approved`.
2. The approval card before and after Priya's click.
3. The merged message with minutes and human touches.
4. The `fix-ledger` document.
5. `!roles` output.
