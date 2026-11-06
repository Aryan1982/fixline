import { test } from "node:test";
import assert from "node:assert/strict";
import { ordersToCsv } from "../src/export.js";

test("exports one row per order line with a header", () => {
  const csv = ordersToCsv([{ id: "A1", date: "2026-11-01", lines: [{ sku: "TOTE", qty: 2 }] }]);
  assert.equal(csv, "order_id,date,sku,product,qty,line_total\nA1,2026-11-01,TOTE,Canvas tote,2,$48.00\n");
});
