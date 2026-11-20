import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from "crypto";
import { cookies, headers } from "next/headers";
import { getRaw, setRaw } from "@/lib/settings";

const COOKIE = "favora_admin";
const MAX_AGE = 60 * 60 * 24 * 7;

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  const h = scryptSync(pw, salt, 64).toString("hex");
  return `${salt}:${h}`;
}

function checkHash(pw: string, stored: string): boolean {
  const [salt, h] = stored.split(":");
  if (!salt || !h) return false;
  const a = Buffer.from(scryptSync(pw, salt, 64).toString("hex"));
  const b = Buffer.from(h);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** "env" when ADMIN_PASSWORD is set, "db" when a password has been created, otherwise null. */
export async function adminMode(): Promise<"env" | "db" | null> {
  if (process.env.ADMIN_PASSWORD) return "env";
  return (await getRaw("_adminHash")) ? "db" : null;
}

async function secret(): Promise<string> {
  if (process.env.ADMIN_PASSWORD) {
    return createHash("sha256").update(`favora:${process.env.ADMIN_PASSWORD}`).digest("hex");
  }
  return (await getRaw("_adminHash")) ?? "";
}

export async function verifyAdminPassword(pw: string): Promise<boolean> {
  if (process.env.ADMIN_PASSWORD) {
    const a = createHash("sha256").update(pw).digest();
    const b = createHash("sha256").update(process.env.ADMIN_PASSWORD).digest();
    return timingSafeEqual(a, b);
  }
  const stored = await getRaw("_adminHash");
  return stored ? checkHash(pw, stored) : false;
}

export async function createAdminPassword(pw: string): Promise<boolean> {
  if ((await adminMode()) !== null) return false;
  await setRaw("_adminHash", hashPassword(pw));
  return true;
}

export async function changeAdminPassword(pw: string) {
  await setRaw("_adminHash", hashPassword(pw));
}

function sign(exp: string, sec: string) {
  return createHmac("sha256", sec).update(exp).digest("hex");
}

export async function startAdminSession() {
  const sec = await secret();
  if (!sec) return;
  const exp = String(Date.now() + MAX_AGE * 1000);
  const jar = await cookies();
  const proto = (await headers()).get("x-forwarded-proto");
  jar.set(COOKIE, `${exp}.${sign(exp, sec)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: proto === "https",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function endAdminSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  const v = jar.get(COOKIE)?.value;
  if (!v) return false;
  const [exp, sig] = v.split(".");
  const sec = await secret();
  if (!exp || !sig || !sec) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = sign(exp, sec);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
