// Money is handled in integer cents everywhere it is stored.

export function toCents(dollars) {
  return Math.round(dollars * 100);
}

export function formatCents(cents) {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}$${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}
