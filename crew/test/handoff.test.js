import { test } from "node:test";
import assert from "node:assert/strict";
import { parseHandoff } from "../src/crew.js";
import { lastJson } from "../src/llm.js";

test("a hand-off is read after the @role prefix Switch adds", () => {
  assert.deepEqual(parseHandoff("@ci **FX-12 · fix ready**\nBranch `fx-12`"), { ticket: "FX-12", stage: "fix ready" });
});

test("a ticket mention with an unknown stage is not a hand-off", () => {
  assert.equal(parseHandoff("**FX-3 · please merge**"), null);
  assert.equal(parseHandoff("Ticket FX-3 is fixed"), null);
});

test("lastJson takes the final object, including nested ones", () => {
  const text = 'First idea: {"verdict":"changes"}\nFinal:\n```json\n{"verdict":"approve","must_fix":[],"meta":{"rounds":2}}\n```';
  assert.deepEqual(lastJson(text), { verdict: "approve", must_fix: [], meta: { rounds: 2 } });
});

test("lastJson reads a bare trailing object", () => {
  assert.deepEqual(lastJson('done.\n{"kind":"bug","reply":"Filed {it}"}'), { kind: "bug", reply: "Filed {it}" });
});

test("lastJson fails loudly when the model returned no JSON", () => {
  assert.throws(() => lastJson("I could not finish."), /no JSON object/);
});
