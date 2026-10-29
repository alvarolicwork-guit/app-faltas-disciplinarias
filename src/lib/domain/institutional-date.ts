/** Sanction dates are civil dates; registration and resolution are instants. */
export function boliviaDate(value: Date | number = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/La_Paz", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  return ["year", "month", "day"].map(key => parts.find(p => p.type === key)!.value).join("-");
}
export function previousMonthDate(date: string): string {
  const [y,m,d] = date.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1, 0));
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), Math.min(d, end.getUTCDate()))).toISOString().slice(0,10);
}
export function civilMonth(date: string): string { return date.slice(0,7); }
