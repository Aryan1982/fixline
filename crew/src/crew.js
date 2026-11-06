// The Fixline crew: five Switch agents that take a support report from a
// person to a reviewed, approved merge. Every hand-off between them is a
// Switch message addressed to a room role, posted in the ticket's thread, so
// the thread is the ticket: anyone (person or agent) can read it, and any
// agent holding a role can pick the work up from it.
import { randomUUID } from "node:crypto";
import { PROVIDERS, lastJson } from "./llm.js";
import { summarizeTests } from "./repo.js";

export const CREW = [
  { name: "fixline-triage", role: "triage", provider: "claude", displayName: "Triage · Claude Code", description: "Meets every report from support, dedups it against known issues, files tickets, and closes the loop with the reporter." },
  { name: "fixline-repro", role: "repro", provider: "codex", displayName: "Repro · Codex", description: "Turns a ticket into a failing test that proves the bug." },
  { name: "fixline-fixer", role: "fixer", provider: "claude", displayName: "Fixer · Claude Code", description: "Fixes the code until the repro test passes, without touching the test." },
  { name: "fixline-reviewer", role: "reviewer", provider: "codex", displayName: "Reviewer · Codex", description: "Reviews every fix with a different model than the one that wrote it." },
  { name: "fixline-ci", role: "ci", provider: null, displayName: "CI Gate", description: "Deterministic gate: runs tests, checks the repro test was not edited, and asks a human to approve every merge." },
];

// Stage labels. A hand-off's first line reads `**FX-7 · <stage>**`.
export const STAGE = {
  ticket: "new ticket",
  reproReady: "repro ready",
  reproConfirmed: "repro confirmed",
  reproRejected: "repro rejected",
  fixReady: "fix ready",
  testsFailed: "tests failed",
  reviewRequested: "review requested",
  changesRequested: "changes requested",
  reviewApproved: "review approved",
  merged: "merged",
  declined: "declined",
};
const STAGES = Object.values(STAGE);

export function parseHandoff(body) {
  const m = body.match(/\*\*(FX-\d+) · ([a-z ]+)\*\*/);
  if (!m || !STAGES.includes(m[2])) return null;
  return { ticket: m[1], stage: m[2] };
}

const header = (ticket, stage) => `**${ticket} · ${stage}**`;
const quote = (s) => s.split("\n").map((l) => `> ${l}`).join("\n");
const code = (s) => "```\n" + s.replace(/```/g, "'''") + "\n```";
// An answer typed at a Switch approval card: "A3 1", or a bare yes/no.
const APPROVAL_REPLY = /^\s*(A\d+\s+\d+|yes|no)\s*$/i;
// Model-written text goes into Markdown messages; a stray `*` (as in
// "dollars * 100") would otherwise italicise half a sentence.
const chatSafe = (v) =>
  typeof v === "string" ? v.replace(/\*/g, "\\*") : Array.isArray(v) ? v.map(chatSafe) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, chatSafe(x)])) : v;
const commitMessage = (ticket, text) => {
  text = text.replace(/\\\*/g, "*");
  const first = text.split(/(?<=\.)\s/)[0];
  return first.length <= 68 ? `${ticket}: ${first.replace(/\.$/, "")}` : `${ticket}: ${first.slice(0, 64).replace(/\s\S*$/, "")}…\n\n${text}`;
};

class Member {
  constructor({ spec, agent, ctx }) {
    this.spec = spec;
    this.agent = agent;
    this.ctx = ctx;
    this.queue = Promise.resolve();
    this.log = (...a) => ctx.log(`[${spec.role}]`, ...a);
  }

  async start() {
    const { roomId } = this.ctx;
    await this.agent.connect([roomId]);
    await this.claim();
    // A dropped socket loses the role lease once it lapses; take it back.
    this.agent.on("connected", () => this.claim().catch((e) => this.log("reclaim:", e.message)));
    this.agent.on("message", (ev) => this.enqueue(ev));
    this.log(`online as @${this.spec.name}, holding @${this.spec.role}`);
  }

  async claim() {
    this.room = await this.agent.op("connect_to_room", { room_id: this.ctx.roomId });
    const role = this.room.roles?.find((r) => r.name === this.spec.role);
    if (role?.held_by?.some((h) => h === this.spec.name || h?.name === this.spec.name)) return;
    try {
      await this.agent.op("assume_role", { role: this.spec.role });
    } catch (e) {
      this.log("assume_role:", e.message);
    }
  }

  enqueue(ev) {
    const p = ev.payload;
    if (!p?.addressed || p.sender_name === this.spec.name) return;
    this.queue = this.queue.then(() => this.handleSafely(ev));
  }

  async handleSafely(ev) {
    const p = ev.payload;
    const threadId = p.thread_id ?? p.message_id;
    const turnId = randomUUID();
    await this.agent.reportActivity({ turnId, status: "inProgress", title: "Working…", roomId: ev.room_id, threadId });
    try {
      await this.handle(p, threadId);
    } catch (e) {
      this.log("error:", e.stack ?? e.message);
      await this.say(`⚠️ I hit an error and stopped: \`${String(e.message).slice(0, 400)}\`\n@${this.ctx.approvers[0]} can you take a look?`, threadId).catch(() => {});
    } finally {
      await this.agent.reportActivity({ turnId, status: "completed", title: "Done", roomId: ev.room_id, threadId });
    }
  }

  say(body, threadId) {
    return this.agent.op("post_message", { body, thread_id: threadId ?? null });
  }

  handoff(role, ticket, stage, text, threadId) {
    return this.agent.op("send_targeted_message", {
      body: `${header(ticket, stage)}\n${text}`,
      target_roles: [role],
      thread_id: threadId,
    });
  }

  tell(names, text, threadId) {
    return this.agent.op("send_targeted_message", { body: text, target_names: names, thread_id: threadId });
  }

  /** The whole ticket thread, oldest first, as {sender_name, body, timestamp, kind}. */
  async thread(threadId) {
    const ctx = await this.agent.op("read_context", { limit: 200 });
    const t = ctx.threads.find((t) => t.root.id === threadId || t.replies.some((r) => r.id === threadId));
    return t ? [t.root, ...t.replies] : [];
  }

  transcript(entries) {
    return entries
      .filter((e) => e.kind === "message")
      .map((e) => `${e.sender_name}: ${e.body}`)
      .join("\n\n");
  }

  /** The ticket brief triage filed, recovered from the thread. */
  briefFrom(entries, ticket) {
    const filed = entries.find((e) => e.body.includes(header(ticket, STAGE.ticket)));
    return filed ? filed.body.slice(filed.body.indexOf(header(ticket, STAGE.ticket))) : "";
  }

  /** Participant ids are opaque and differ per surface; names are stable. */
  isPerson(senderName) {
    return !CREW.some((c) => c.name === senderName);
  }

  async think(prompt, { cwd, edit = false } = {}) {
    const run = PROVIDERS[this.spec.provider];
    const started = Date.now();
    const { text } = await run(prompt, { cwd, edit });
    this.log(`${this.spec.provider} answered in ${Math.round((Date.now() - started) / 1000)}s`);
    return text;
  }
}

// ── Triage ───────────────────────────────────────────────────────────────

class Triage extends Member {
  async handle(p, threadId) {
    const h = parseHandoff(p.body);
    if (h && (h.stage === STAGE.merged || h.stage === STAGE.declined)) return this.closeOut(h, threadId);
    if (!this.isPerson(p.sender_name)) return;
    // Answers to an approval card ("A3 1", "yes") are Switch's to handle.
    if (APPROVAL_REPLY.test(p.body)) return;
    return this.intake(p, threadId);
  }

  async intake(p, threadId) {
    const entries = p.thread_id ? await this.thread(threadId) : [];
    const known = await this.ctx.knownIssues(this.agent);
    const prompt = `You are the triage agent of a support room where a non-technical support person reports customer problems with "shopkit", the shop's order/discount/refund/export code (the repository is your working directory; read it to locate the problem).

Known issues (already tracked; do not file these again):
${known}

${entries.length ? `Conversation so far in this thread:\n${this.transcript(entries)}\n\n` : ""}New message from ${p.sender_name}:
${p.body}

Decide what this is:
- "bug": a new defect in shopkit. Find the code responsible.
- "duplicate": matches a known issue above.
- "needs_info": you cannot tell what is wrong without one specific fact. Ask exactly one question.
- "question": a question you can answer from the code or the known issues.
- "other": anything else (thanks, chit-chat).

Write "reply" to ${p.sender_name} in plain, friendly English with no code or jargon, at most 3 sentences. For "bug", say you filed it and the crew is reproducing it. For "duplicate", name the known issue id and give its customer workaround.

End with exactly one JSON object:
{"kind":"bug|duplicate|needs_info|question|other","reply":"...","known_issue":"KI-n or null","title":"short bug title","summary":"one-line technical restatement","steps":"how to trigger it, concrete inputs","expected":"...","actual":"...","area":"file and function you believe is responsible"}`;
    const out = chatSafe(lastJson(await this.think(prompt, { cwd: this.ctx.repo.path })));
    if (out.kind !== "bug") {
      await this.tell([p.sender_name], out.reply, threadId);
      return;
    }
    const ticket = this.ctx.nextTicket();
    await this.tell([p.sender_name], `${out.reply}\nTicket: \`${ticket}\` — I'll update you here.`, threadId);
    await this.handoff(
      "repro",
      ticket,
      STAGE.ticket,
      [
        `**${out.title}** · reported by @${p.sender_name}`,
        `- **Summary:** ${out.summary}`,
        `- **Steps:** ${out.steps}`,
        `- **Expected:** ${out.expected}`,
        `- **Actual:** ${out.actual}`,
        `- **Suspected area:** ${out.area}`,
        "",
        `Customer's words:`,
        quote(p.body),
      ].join("\n"),
      threadId
    );
  }

  async closeOut({ ticket, stage }, threadId) {
    const entries = await this.thread(threadId);
    const brief = this.briefFrom(entries, ticket);
    const reporter = brief.match(/reported by @([a-z0-9._-]+)/i)?.[1];
    const prompt = `You are the triage agent of a support room. Ticket ${ticket} just ${stage === STAGE.merged ? "had its fix approved and merged" : "had its fix declined by the engineering lead"}.

Full ticket thread:
${this.transcript(entries)}

Write two things:
1. "to_support": 2 sentences for ${reporter ?? "the support person"} saying what was wrong and what happens now, plain English, no code.
2. "customer_message": a short, warm message support can paste to the customer (no internal names, no ticket ids, no code). ${stage === STAGE.merged ? "Say the problem is fixed and, if money was involved, what they are owed." : "Say the team is still working on it."}

End with exactly one JSON object: {"to_support":"...","customer_message":"..."}`;
    const out = chatSafe(lastJson(await this.think(prompt)));
    const text = `${out.to_support}\n\n**Reply you can send the customer:**\n${quote(out.customer_message)}`;
    if (reporter) await this.tell([reporter], text, threadId);
    else await this.say(text, threadId);
  }
}

// ── Repro ────────────────────────────────────────────────────────────────

class Repro extends Member {
  async handle(p, threadId) {
    const h = parseHandoff(p.body);
    if (!h || (h.stage !== STAGE.ticket && h.stage !== STAGE.reproRejected)) return;
    const { ticket } = h;
    const { repo } = this.ctx;
    const cwd = await repo.ensureWorktree(ticket);
    const entries = await this.thread(threadId);
    const testFile = `test/${ticket.toLowerCase()}.test.js`;
    const prompt = `You are the reproducer on a bug-fixing crew. Your working directory is a git worktree of "shopkit" (plain Node.js ESM, tests use node:test and node:assert/strict; run them with \`node --test\`).

Ticket thread:
${this.transcript(entries)}

Task: write ONE new test file, ${testFile}, that reproduces this bug. It must FAIL on the current code for the reason in the ticket, and pass once the bug is fixed. Use the customer's concrete numbers when there are any. Keep it small: 1 to 3 focused test cases.
Rules: do not modify any file under src/ or any existing test. Do not fix the bug. Run \`node --test ${testFile}\` and confirm it fails.

End with exactly one JSON object: {"test_file":"${testFile}","what_it_checks":"one sentence","observed":"the failing assertion, actual vs expected"}`;
    const out = chatSafe(lastJson(await this.think(prompt, { cwd, edit: true })));
    // A reproducer only adds a test. Anything else it touched is reverted.
    const stray = (await repo.dirtyFiles(ticket)).filter((f) => f !== testFile);
    for (const f of stray) await repo.git(["checkout", "--", f], cwd).catch(() => repo.git(["clean", "-fdq", "--", f], cwd));
    const sha = await repo.commitAll(ticket, `${ticket}: failing test reproducing the report`);
    await this.handoff(
      "ci",
      ticket,
      STAGE.reproReady,
      [
        `Branch \`${repo.branch(ticket)}\` @ \`${sha}\` adds \`${testFile}\`.`,
        `- **Checks:** ${out.what_it_checks}`,
        `- **Observed:** ${out.observed}`,
        stray.length ? `- Reverted edits outside the test: ${stray.map((f) => `\`${f}\``).join(", ")}` : "",
        "Please confirm it fails on this branch.",
      ]
        .filter(Boolean)
        .join("\n"),
      threadId
    );
  }
}

// ── Fixer ────────────────────────────────────────────────────────────────

class Fixer extends Member {
  async handle(p, threadId) {
    const h = parseHandoff(p.body);
    const ticket = h?.ticket ?? (this.isPerson(p.sender_name) ? p.body.match(/\bFX-\d+\b/)?.[0] : null);
    if (!ticket) return;
    if (h && ![STAGE.reproConfirmed, STAGE.testsFailed, STAGE.changesRequested].includes(h.stage)) return;
    const { repo } = this.ctx;
    const cwd = await repo.ensureWorktree(ticket);
    const entries = await this.thread(threadId);
    const testFile = `test/${ticket.toLowerCase()}.test.js`;
    const why = !h
      ? `A person on the team (${p.sender_name}) asked for a change. Their message:\n${p.body}`
      : h.stage === STAGE.reproConfirmed
        ? "CI confirmed the repro test fails. Make it pass."
        : h.stage === STAGE.testsFailed
          ? "Your last attempt did not pass CI. The failure is in the latest message of the thread."
          : "The reviewer requested changes. Address every must-fix item in the latest review message.";
    const prompt = `You are the fixer on a bug-fixing crew. Your working directory is a git worktree of "shopkit" (Node.js ESM, tests: \`node --test\`).

Ticket thread:
${this.transcript(entries)}

${why}

Rules:
- Fix the root cause in src/, not the symptom. Smallest change that is correct for every input, not only the customer's numbers.
- Do NOT edit ${testFile}: it is the reproduction and CI rejects any change to it. You may add other tests.
- Run \`node --test\` and make the whole suite pass.

End with exactly one JSON object: {"root_cause":"one sentence","fix":"one sentence","files":["..."]}`;
    const out = chatSafe(lastJson(await this.think(prompt, { cwd, edit: true })));
    if (!(await repo.dirtyFiles(ticket)).length) {
      await this.say(`${ticket}: I found nothing to change. ${out.root_cause}`, threadId);
      return;
    }
    const sha = await repo.commitAll(ticket, commitMessage(ticket, out.fix));
    await this.handoff(
      "ci",
      ticket,
      STAGE.fixReady,
      [`Branch \`${repo.branch(ticket)}\` @ \`${sha}\`.`, `- **Root cause:** ${out.root_cause}`, `- **Fix:** ${out.fix}`, `- **Files:** ${(out.files ?? []).map((f) => `\`${f}\``).join(", ")}`].join("\n"),
      threadId
    );
  }
}

// ── Reviewer ─────────────────────────────────────────────────────────────

class Reviewer extends Member {
  async handle(p, threadId) {
    const h = parseHandoff(p.body);
    if (!h || h.stage !== STAGE.reviewRequested) return;
    const { ticket } = h;
    const { repo } = this.ctx;
    const entries = await this.thread(threadId);
    const rounds = entries.filter((e) => e.body.includes(header(ticket, STAGE.changesRequested))).length;
    const diff = await repo.diff(ticket);
    const prompt = `You are the code reviewer on a bug-fixing crew. A different AI wrote this fix; your job is to catch what it missed. Your working directory is the ticket's worktree of "shopkit"; read any file you need.

Ticket thread:
${this.transcript(entries)}

Diff (main...${repo.branch(ticket)}):
${code(diff.slice(0, 60_000))}

Review for: does it fix the root cause rather than the customer's one case; does it break other inputs or callers; is the repro test meaningful; anything unsafe. Only block on real defects, not style.${rounds >= 2 ? " This is the final review round: approve unless there is a defect that would hurt customers." : ""}

End with exactly one JSON object: {"verdict":"approve|changes","summary":"one or two sentences","must_fix":["only when verdict is changes"]}`;
    const out = chatSafe(lastJson(await this.think(prompt, { cwd: repo.worktree(ticket) })));
    if (out.verdict === "changes" && out.must_fix?.length) {
      await this.handoff("fixer", ticket, STAGE.changesRequested, [`${out.summary}`, ...out.must_fix.map((m, i) => `${i + 1}. ${m}`)].join("\n"), threadId);
    } else {
      await this.handoff("ci", ticket, STAGE.reviewApproved, `✅ ${out.summary}`, threadId);
    }
  }
}

// ── CI gate (deterministic, no model) ────────────────────────────────────

class CiGate extends Member {
  async handle(p, threadId) {
    const h = parseHandoff(p.body);
    if (!h) return;
    if (h.stage === STAGE.reproReady) return this.confirmRepro(h.ticket, threadId);
    if (h.stage === STAGE.fixReady) return this.checkFix(h.ticket, threadId);
    if (h.stage === STAGE.reviewApproved) return this.gateMerge(h.ticket, threadId);
  }

  testFile(ticket) {
    return `test/${ticket.toLowerCase()}.test.js`;
  }

  async confirmRepro(ticket, threadId) {
    const { repo } = this.ctx;
    const file = this.testFile(ticket);
    const sha = await repo.head(ticket);
    if (!(await repo.blob(ticket, file))) {
      return this.handoff("repro", ticket, STAGE.reproRejected, `No \`${file}\` on \`${repo.branch(ticket)}\`. Add the test there.`, threadId);
    }
    const run = await repo.test(ticket, { only: file });
    const { totals, text } = summarizeTests(run.output);
    if (run.pass) {
      return this.handoff("repro", ticket, STAGE.reproRejected, `\`${file}\` passes on current code, so it does not reproduce the bug.\n${totals}`, threadId);
    }
    await this.handoff(
      "fixer",
      ticket,
      STAGE.reproConfirmed,
      `🔴 Bug reproduced on \`${sha}\` (${totals}).\n${code(text)}\nRepro commit: \`${sha}\`. From here on \`${file}\` is locked: any edit to it fails CI.`,
      threadId
    );
  }

  async reproCommit(ticket, threadId) {
    const entries = await this.thread(threadId);
    const confirmed = entries.filter((e) => e.body.includes(header(ticket, STAGE.reproConfirmed))).pop();
    return confirmed?.body.match(/Repro commit: `([0-9a-f]+)`/)?.[1] ?? null;
  }

  async checkFix(ticket, threadId) {
    const { repo } = this.ctx;
    const file = this.testFile(ticket);
    const base = await this.reproCommit(ticket, threadId);
    const attempts = (await this.thread(threadId)).filter((e) => e.body.includes(header(ticket, STAGE.testsFailed))).length;
    const escalate = attempts >= 2 ? `\n@${this.ctx.approvers[0]} this is attempt ${attempts + 1}; you may want to step in.` : "";
    if (base && (await repo.changedFiles(ticket, base)).includes(file)) {
      return this.handoff("fixer", ticket, STAGE.testsFailed, `🚫 \`${file}\` was modified after the repro was confirmed (\`${base}\`). Revert it and fix \`src/\` instead.${escalate}`, threadId);
    }
    const run = await repo.test(ticket);
    const { totals, text } = summarizeTests(run.output);
    if (!run.pass) {
      return this.handoff("fixer", ticket, STAGE.testsFailed, `🔴 Suite fails (${totals}).\n${code(text)}${escalate}`, threadId);
    }
    const stat = await repo.diffStat(ticket);
    await this.handoff("reviewer", ticket, STAGE.reviewRequested, `🟢 Full suite green (${totals}). Repro test untouched since \`${base}\`.\n${code(stat)}`, threadId);
  }

  async gateMerge(ticket, threadId) {
    const { repo, approvers } = this.ctx;
    const entries = await this.thread(threadId);
    const brief = this.briefFrom(entries, ticket);
    const title = brief.split("\n")[1]?.replace(/\*\*/g, "").split(" · ")[0] ?? ticket;
    const stat = (await repo.diffStat(ticket)).split("\n").pop()?.trim();
    // @ci takes instructions only from its owner (the engineering lead) and the
    // crew, so Switch itself refuses an answer to this card from anyone else.
    const { requestId } = await this.agent.openApproval({
      roomId: this.ctx.roomId,
      threadId,
      title: `Merge ${ticket} into main: ${title}`,
      detail: `${stat} · tests green · repro locked · reviewed by Codex`,
    });
    const view = await this.agent.waitForApproval(requestId);
    if (view.state !== "answered") return;
    const fresh = await this.thread(threadId);
    const who = fresh.find((e) => e.sender === view.answeredBy)?.sender_name ?? approvers[0];
    if (view.answer !== "allow") {
      await this.handoff("triage", ticket, STAGE.declined, `Merge declined by @${who}. Branch \`${repo.branch(ticket)}\` is parked.`, threadId);
      return;
    }
    const sha = await repo.merge(ticket, `Merge ${ticket}: ${title} (approved by ${who})`);
    const started = fresh[0]?.timestamp ?? Date.now();
    const minutes = ((Date.now() - started) / 60_000).toFixed(1);
    // What people wrote in the thread, not counting answers typed at approval
    // cards, plus the one approval that counted.
    const typed = fresh.filter((e) => e.kind === "message" && this.isPerson(e.sender_name) && !APPROVAL_REPLY.test(e.body));
    const touches = typed.length + 1;
    await this.ctx.recordLedger(this.agent, { ticket, title, sha, approvedBy: who, minutes, touches });
    await this.handoff(
      "triage",
      ticket,
      STAGE.merged,
      `🚀 Merged as \`${sha}\`, approved by @${who}.\n⏱ Report to merge: **${minutes} min** · 🙋 human touches: **${touches}** · logged in the \`fix-ledger\` room document.`,
      threadId
    );
  }
}

export const MEMBERS = { triage: Triage, repro: Repro, fixer: Fixer, reviewer: Reviewer, ci: CiGate };
