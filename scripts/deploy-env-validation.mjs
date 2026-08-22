export const DEFAULT_APP_TIME_ZONE = "Asia/Tokyo";

export function validateAppTimeZone(value) {
  const appTimeZone = typeof value === "string" && value.trim() ? value.trim() : DEFAULT_APP_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: appTimeZone }).format();
  } catch {
    throw new Error(`APP_TIME_ZONE must be a valid IANA timezone (received: ${appTimeZone}).`);
  }
  return appTimeZone;
}
