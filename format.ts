export function bdt(n: number): string {
  return `৳${Math.round(n).toLocaleString("en-US")}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Normalise Bangladeshi mobile numbers to 01XXXXXXXXX. Returns null if invalid. */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const m = digits.match(/^(?:\+?88)?(01[3-9]\d{8})$/);
  return m ? m[1] : null;
}

export function dateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Dhaka",
  });
}

export function dateOnly(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Dhaka",
  });
}

export const STATUS_LABEL: Record<string, string> = {
  pending: "Order received",
  confirmed: "Confirmed",
  shipped: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};
