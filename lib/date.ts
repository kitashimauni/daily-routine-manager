const pad = (value: number) => String(value).padStart(2, "0");
const padYear = (value: number) => String(value).padStart(4, "0");

export function getTodayDate() {
  const today = new Date();
  return toDateKey(today);
}

export function toDateKey(date: Date) {
  return `${padYear(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date;
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
  const parsedDate = parseDateKey(dateKey);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(parsedDate);
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
  date.setDate(1);
  date.setMonth(date.getMonth() + 1);
  date.setDate(0);
  return date.getDate();
}

export function isDateInRange(dateKey: string, startDate: string, endDate?: string) {
  return dateKey >= startDate && (!endDate || dateKey <= endDate);
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];
