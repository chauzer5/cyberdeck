import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const TIME_DIVISIONS: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
  { amount: 60, unit: "second" },
  { amount: 60, unit: "minute" },
  { amount: 24, unit: "hour" },
  { amount: 7, unit: "day" },
  { amount: 4.345, unit: "week" },
  { amount: 12, unit: "month" },
  { amount: Infinity, unit: "year" },
];

/** Format an ISO date string as a relative time (e.g. "5 minutes ago") */
export function timeAgo(dateStr: string): string {
  let seconds = (new Date(dateStr).getTime() - Date.now()) / 1000;

  for (const { amount, unit } of TIME_DIVISIONS) {
    if (Math.abs(seconds) < amount) {
      return rtf.format(Math.round(seconds), unit);
    }
    seconds /= amount;
  }
  return rtf.format(Math.round(seconds), "year");
}

/** Format a timestamp (ms) as a relative time */
export function timeAgoFromMs(ts: number): string {
  return timeAgo(new Date(ts).toISOString());
}
