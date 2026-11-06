import { product } from "./catalog.js";
import { toCents } from "./money.js";

const DISCOUNTS = {
  SAVE10: { kind: "percent", value: 10 },
  WELCOME5: { kind: "fixed", cents: 500 },
};

/** Subtotal in cents for [{sku, qty}]. */
export function subtotalCents(lines) {
  return lines.reduce((sum, l) => sum + toCents(product(l.sku).price) * l.qty, 0);
}

/** Applies a discount code. Returns {totalCents, discountCents, applied}. */
export function applyDiscount(lines, code) {
  const subtotal = subtotalCents(lines);
  const d = DISCOUNTS[code];
  if (!d) return { totalCents: subtotal, discountCents: 0, applied: false };
  const discountCents =
    d.kind === "percent" ? Math.round((subtotal * d.value) / 100) : Math.min(d.cents, subtotal);
  return { totalCents: subtotal - discountCents, discountCents, applied: true };
}
