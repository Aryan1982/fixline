# Submission form answers

Answers for each field of https://www.wemakedevs.org/hackathons/switch/submit, ready to paste.

## Part 1: Project details

**Project title**
Support reports the bug, and it gets fixed by agents

**Tracks**
Best Business Workflow

**Project description**
Support teams hear about bugs first and can't fix them. Fixline puts a five-agent crew into the support channel through Switch. Sam from support types a customer complaint in plain English. Triage (Claude Code) checks the room's known-issues document and files a ticket. Repro (Codex) writes a failing test. A deterministic CI gate watches the test fail and locks it. Fixer (Claude Code) fixes the code without touching that test. Reviewer (Codex, a different model) reviews the diff. Then CI raises a Switch approval card that only the engineering lead can answer. After the merge, triage tells support what went wrong and drafts a reply for the customer.

In real runs, report to merge took 3.2 to 3.7 minutes for a refund rounding bug. A CSV bug took 6.9 minutes because Codex sent the first fix back for a real regression. Duplicates were answered from the known-issues document without a ticket. Every merge lands in a fix-ledger room document with the time it took and who approved it. Runs locally with make up, make setup, make crew.

**GitHub repository**
https://github.com/Aryan1982/fixline

**Demo video**
https://www.youtube.com/watch?v=TnHHsiQtK2s

**Live demo or deployment**
https://fixline-iota.vercel.app

## Part 2: Track details

**Pull requests**: none (not entering Best Core Contribution)

**Blog post**
https://medium.com/@AryanThakor/i-put-claude-code-and-codex-in-a-support-channel-and-made-them-check-each-others-work-300fe546b3a1

**Images**: `site/img/og.png`, `docs/img/thread-full.png`, `site/img/approve.png`, `docs/img/gateway-roles.png`

**Wispr usage card**: a screenshot from Wispr Flow Insights, only if you dictated part of the work

**#HowISwitch post**: the URL of the X thread from `docs/SOCIAL.md` once it's posted

## Part 3: How you used Switch

**How did you use Switch in your project?**
Switch is what turns five separate AI tools into one team that works inside the support channel.

Without Fixline, a support person files a ticket, waits for an engineer, and rarely hears how it ended. With Switch, the support channel itself becomes the workplace. Sam from support describes the customer's problem in plain English, and the crew takes it from there.

- Everyone works in one room. Support, the engineering lead and five AI agents (two Claude Code, two Codex, and one automated quality check) share a single chat channel. Each agent appears with its own name, like a colleague.
- Agents hold jobs, not scripts. With Switch roles (triage, reproduce, fix, review, quality check), work goes to "whoever does reviews". The team can swap in a different agent without changing the process.
- One thread per customer issue. The conversation is the ticket, so anyone can scroll it and see what was found, fixed and decided.
- Shared team knowledge. A known-issues document in the room means a repeat complaint gets the existing workaround instead of a new ticket. A fix log records every change, how long it took, and who approved it.
- People stay in control. Nothing goes live until the engineering lead presses Approve in the chat, and Switch enforces who may approve. When support tried to approve in our tests, Switch ignored it.

The result: in our runs, a customer's refund complaint became a reviewed, approved fix in about 3 minutes. It took two human actions, the report and the approval.

**What did you like about Switch, and what would you improve?**
What we liked:
- Agents feel like teammates, not bots. They join the chat with names and jobs, so people outside engineering can work with them without learning anything new.
- Roles make the process clear. You assign jobs instead of tools, and you can see who holds each job at any time.
- The built-in approval button is the standout feature. Leaders get a simple, recorded yes or no in the chat they already use, and Switch remembers who said yes.
- Shared documents in the room give every person and agent the same context.

What we'd improve:
- Getting started on a laptop had rough edges. The bundled chat app crashed on Apple Silicon Macs, and talking to an agent without @-mentioning it has to be switched on separately on a self-hosted server, which the quickstart doesn't mention.
- A few docs pages didn't match the released version, which cost us time.
- An official starter kit for building your own agent would make Switch much easier for teams that bring custom agents.
- A simple per-room summary of work done and approvals given would help teams show the value to their managers.
