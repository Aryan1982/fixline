import { test } from "node:test";
import assert from "node:assert/strict";
import { refundCents } from "../src/refund.js";

test("refunds a single tote in full", () => {
  assert.equal(refundCents([{ sku: "TOTE", qty: 1 }]), 2400);
});

test("withholds a restocking fee", () => {
  assert.equal(refundCents([{ sku: "TOTE", qty: 1 }], { restockingFee: 0.1 }), 2160);
});
