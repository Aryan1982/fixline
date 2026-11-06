import { test } from "node:test";
import assert from "node:assert/strict";
import { applyDiscount, subtotalCents } from "../src/cart.js";

test("subtotal sums line prices in cents", () => {
  assert.equal(subtotalCents([{ sku: "MUG", qty: 2 }, { sku: "TOTE", qty: 1 }]), 6398);
});

test("SAVE10 takes 10% off", () => {
  const r = applyDiscount([{ sku: "TOTE", qty: 2 }], "SAVE10");
  assert.deepEqual(r, { totalCents: 4320, discountCents: 480, applied: true });
});

test("unknown codes are ignored", () => {
  assert.equal(applyDiscount([{ sku: "TOTE", qty: 1 }], "NOPE").applied, false);
});
