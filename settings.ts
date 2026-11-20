import { cache } from "react";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { SETTING_DEFAULTS, type Settings } from "@/lib/pricing";

/** Public settings (keys starting with "_" are private and never returned). */
export const getSettings = cache(async (): Promise<Settings> => {
  const rows = await db.select().from(settings);
  const out: Settings = { ...SETTING_DEFAULTS };
  for (const r of rows) {
    if (!r.key.startsWith("_")) out[r.key] = r.value;
  }
  return out;
});

export async function getRaw(key: string): Promise<string | null> {
  const rows = await db.select().from(settings);
  return rows.find((r) => r.key === key)?.value ?? null;
}

export async function setRaw(key: string, value: string) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value } });
}

export function waLink(number: string, text?: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
