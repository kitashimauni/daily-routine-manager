import { DEFAULT_APP_TIME_ZONE } from "@/lib/date";

const pad = (value: number) => String(value).padStart(2, "0");

export function getAppTimeZone() {
  return process.env.APP_TIME_ZONE || DEFAULT_APP_TIME_ZONE;
}

export function getServerTodayDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: getAppTimeZone(),
    year: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function addDateDays(dateKey: string, amount: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
