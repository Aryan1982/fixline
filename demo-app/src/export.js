import { product } from "./catalog.js";
import { formatCents, toCents } from "./money.js";

const HEADER = ["order_id", "date", "sku", "product", "qty", "line_total"];

/** Orders -> CSV for the accounting export. One row per order line. */
export function ordersToCsv(orders) {
  const rows = [HEADER.join(",")];
  for (const o of orders) {
    for (const l of o.lines) {
      const p = product(l.sku);
      rows.push(
        [o.id, o.date, p.sku, p.name, l.qty, formatCents(toCents(p.price) * l.qty)].join(",")
      );
    }
  }
  return rows.join("\n") + "\n";
}
