export const CATALOG = {
  MUG: { sku: "MUG", name: "Stoneware mug", price: 19.99 },
  SOCKS: { sku: "SOCKS", name: "Socks, wool", price: 12.5 },
  TOTE: { sku: "TOTE", name: "Canvas tote", price: 24.0 },
  CANDLE: { sku: "CANDLE", name: 'Candle "Cedar" 8oz', price: 16.0 },
};

export function product(sku) {
  const p = CATALOG[sku];
  if (!p) throw new Error(`unknown sku: ${sku}`);
  return p;
}
