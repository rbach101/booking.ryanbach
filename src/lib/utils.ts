import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Parse a YYYY-MM-DD date string as a local date (not UTC).
 * Avoids the timezone shift caused by `new Date("2026-03-03")` which
 * creates a UTC midnight date that displays as the previous day in
 * negative-offset timezones (e.g. Hawaii).
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}
