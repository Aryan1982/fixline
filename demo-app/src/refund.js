import { product } from "./catalog.js";

/**
 * Refund owed for returned items, in cents. A restocking fee (fraction, e.g.
 * 0.1 for 10%) is withheld; the default is no fee.
 */
export function refundCents(lines, { restockingFee = 0 } = {}) {
  const dollars = lines.reduce((sum, l) => sum + product(l.sku).price * l.qty, 0);
  return Math.floor(dollars * (1 - restockingFee) * 100);
}
