const pad = (value: number) => String(value).padStart(2, "0");

export function getTodayDate() {
  const today = new Date();
  return toDateKey(today);
}

export function toDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function getDayOfWeek(dateKey: string) {
  return parseDateKey(dateKey).getDay();
}

export function addDays(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return toDateKey(date);
}

export function addMonths(dateKey: string, amount: number) {
  const date = parseDateKey(dateKey);
  date.setMonth(date.getMonth() + amount);
  return toDateKey(date);
}

export function isFutureDate(dateKey: string) {
  return dateKey > getTodayDate();
}

export function formatDateLong(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parseDateKey(dateKey));
}

export function formatMonth(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long" }).format(
    parseDateKey(dateKey),
  );
}

export function formatShortDate(dateKey: string) {
  return new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(
    parseDateKey(dateKey),
  );
}

export function monthStart(dateKey: string) {
  const date = parseDateKey(dateKey);
  date.setDate(1);
  return toDateKey(date);
}

export function daysInMonth(dateKey: string) {
  const date = parseDateKey(dateKey);
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function isDateInRange(dateKey: string, startDate: string, endDate?: string) {
  return dateKey >= startDate && (!endDate || dateKey <= endDate);
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
