// Git and test-runner plumbing for the codebase the crew works on. Every ticket
// gets its own branch and worktree, so agents never step on each other.
import { execFile } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export class Repo {
  constructor({ path, worktrees }) {
    this.path = path;
    this.worktrees = worktrees;
  }

  async git(args, cwd = this.path) {
    const { stdout } = await exec("git", args, { cwd, maxBuffer: 16 << 20 });
    return stdout.trim();
  }

  branch(ticket) {
    return ticket.toLowerCase();
  }

  worktree(ticket) {
    return join(this.worktrees, this.branch(ticket));
  }

  async ensureWorktree(ticket) {
    const dir = this.worktree(ticket);
    if (existsSync(dir)) return dir;
    mkdirSync(this.worktrees, { recursive: true });
    await this.git(["worktree", "add", "-q", "-b", this.branch(ticket), dir, "main"]);
    return dir;
  }

  /** Files changed in the worktree relative to its last commit, incl. untracked. */
  async dirtyFiles(ticket) {
    const out = await this.git(["status", "--porcelain", "--untracked-files=all"], this.worktree(ticket));
    return out ? out.split("\n").map((l) => l.slice(3)) : [];
  }

  async commitAll(ticket, message) {
    const dir = this.worktree(ticket);
    await this.git(["add", "-A"], dir);
    await this.git(["-c", "user.name=Fixline Crew", "-c", "user.email=crew@fixline.local", "commit", "-q", "-m", message], dir);
    return this.git(["rev-parse", "--short", "HEAD"], dir);
  }

  /** Blob hash of a file at the branch tip; null if absent. */
  async blob(ticket, file) {
    try {
      return await this.git(["rev-parse", `${this.branch(ticket)}:${file}`]);
    } catch {
      return null;
    }
  }

  async diff(ticket, base = "main") {
    return this.git(["diff", `${base}...${this.branch(ticket)}`]);
  }

  async diffStat(ticket, base = "main") {
    return this.git(["diff", "--stat", `${base}...${this.branch(ticket)}`]);
  }

  async changedFiles(ticket, from, to = this.branch(ticket)) {
    const out = await this.git(["diff", "--name-only", `${from}..${to}`]);
    return out ? out.split("\n") : [];
  }

  async head(ticket) {
    return this.git(["rev-parse", "--short", this.branch(ticket)]);
  }

  /** Merges the ticket branch into main with a merge commit; returns its sha. */
  async merge(ticket, message) {
    await this.git(["-c", "user.name=Fixline Crew", "-c", "user.email=crew@fixline.local", "merge", "-q", "--no-ff", "-m", message, this.branch(ticket)]);
    return this.git(["rev-parse", "--short", "HEAD"]);
  }

  /** Runs `node --test` in the ticket's worktree (or main). */
  async test(ticket, { only } = {}) {
    const cwd = ticket ? this.worktree(ticket) : this.path;
    const args = ["--test", "--test-reporter=spec", ...(only ? [only] : [])];
    try {
      const { stdout } = await exec("node", args, { cwd, maxBuffer: 16 << 20 });
      return { pass: true, output: stdout };
    } catch (e) {
      return { pass: false, output: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  }
}

/** Trims node's spec reporter output to what a person needs to see. */
export function summarizeTests(output, max = 1500) {
  const lines = output.split("\n").filter((l) => l.trim());
  const totals = lines.filter((l) => /^ℹ (tests|pass|fail)\b/.test(l)).map((l) => l.slice(2)).join(" · ");
  const start = lines.findIndex((l) => /failing tests:/.test(l));
  const noise = /^\s+at |^ℹ |^test at |^\s*(generatedMessage|code|operator|diff|actual|expected):|^\s*[{}]\s*$|failing tests:/;
  const body =
    start === -1
      ? lines.filter((l) => /^\s*✔/.test(l)).join("\n")
      : lines
          .slice(start)
          .filter((l) => !noise.test(l))
          .map((l) => l.replace(/\s*\([\d.]+ms\)$/, "").replace(/ \{$/, ""))
          .join("\n");
  return { totals, text: body.length > max ? body.slice(0, max) + "\n…" : body };
}
