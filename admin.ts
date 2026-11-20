"use server";

import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  coupons,
  messages,
  orderItems,
  orders,
  products,
  reviews,
  subscribers,
} from "@/db/schema";
import {
  adminMode,
  changeAdminPassword,
  createAdminPassword,
  endAdminSession,
  isAdmin,
  startAdminSession,
  verifyAdminPassword,
} from "@/lib/auth";
import { getSettings, setRaw } from "@/lib/settings";
import { SETTING_DEFAULTS } from "@/lib/pricing";
import { slugify } from "@/lib/format";
import { getTop } from "@/lib/categories";

async function guard() {
  if (!(await isAdmin())) redirect("/admin/login");
}

/* ---------- auth ---------- */

export async function loginAction(fd: FormData) {
  const pw = String(fd.get("password") ?? "");
  if (await verifyAdminPassword(pw)) {
    await startAdminSession();
    redirect("/admin");
  }
  redirect("/admin/login?e=1");
}

export async function setupAction(fd: FormData) {
  const pw = String(fd.get("password") ?? "");
  const pw2 = String(fd.get("password2") ?? "");
  if (pw.length < 8 || pw !== pw2) redirect("/admin/login?e=2");
  const ok = await createAdminPassword(pw);
  if (!ok) redirect("/admin/login");
  await startAdminSession();
  redirect("/admin");
}

export async function logoutAction() {
  await endAdminSession();
  redirect("/admin/login");
}

export async function changePasswordAction(fd: FormData) {
  await guard();
  if ((await adminMode()) !== "db") redirect("/admin/settings?pw=env");
  const current = String(fd.get("current") ?? "");
  const pw = String(fd.get("password") ?? "");
  if (pw.length < 8 || !(await verifyAdminPassword(current))) redirect("/admin/settings?pw=bad");
  await changeAdminPassword(pw);
  await startAdminSession();
  redirect("/admin/settings?pw=ok");
}

/* ---------- orders ---------- */

function randomCode(n = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function updateOrderStatus(fd: FormData) {
  await guard();
  const id = Number(fd.get("id"));
  const status = String(fd.get("status"));
  if (!["pending", "confirmed", "shipped", "delivered", "cancelled"].includes(status)) return;
  const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
  if (!o || o.status === status) return;

  await db.transaction(async (tx) => {
    await tx
      .update(orders)
      .set({
        status,
        deliveredAt: status === "delivered" ? new Date() : o.status === "delivered" ? null : o.deliveredAt,
      })
      .where(eq(orders.id, id));

    const items = await tx.select().from(orderItems).where(eq(orderItems.orderId, id));
    if (status === "cancelled") {
      for (const it of items)
        if (it.productId)
          await tx.update(products).set({ stock: sql`${products.stock} + ${it.qty}` }).where(eq(products.id, it.productId));
    } else if (o.status === "cancelled") {
      for (const it of items)
        if (it.productId)
          await tx
            .update(products)
            .set({ stock: sql`greatest(${products.stock} - ${it.qty}, 0)` })
            .where(eq(products.id, it.productId));
    }
  });

  // Repeat customer reward: this order is now successfully delivered and was placed
  // within N months of the customer's previous delivered order.
  if (status === "delivered") {
    const s = await getSettings();
    if (s.promoRepeatReward === "1") {
      const months = parseInt(s.repeatRewardMonths, 10) || 3;
      const percent = parseInt(s.repeatRewardPercent, 10) || 5;
      const [prev] = await db
        .select()
        .from(orders)
        .where(and(eq(orders.phone, o.phone), ne(orders.id, o.id), isNotNull(orders.deliveredAt)))
        .orderBy(desc(orders.deliveredAt))
        .limit(1);
      if (prev?.deliveredAt) {
        const limit = new Date(prev.deliveredAt);
        limit.setMonth(limit.getMonth() + months);
        const [existing] = await db
          .select({ id: coupons.id })
          .from(coupons)
          .where(and(eq(coupons.issuedForOrderId, o.id), eq(coupons.source, "repeat_reward")))
          .limit(1);
        if (o.createdAt <= limit && !existing) {
          await db.insert(coupons).values({
            code: `THANKS${percent}-${randomCode()}`,
            type: "percent",
            value: percent,
            phone: o.phone,
            maxUses: 1,
            isPublic: false,
            source: "repeat_reward",
            issuedForOrderId: o.id,
            description: `Repeat customer reward for order ${o.orderNo}`,
          });
        }
      }
    }
  }
  redirect("/admin/orders");
}

/* ---------- products ---------- */

const list = (v: FormDataEntryValue | null, sep: RegExp) =>
  String(v ?? "")
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

export async function saveProduct(fd: FormData) {
  await guard();
  const id = Number(fd.get("id")) || null;
  const name = String(fd.get("name") ?? "").trim();
  const categorySlug = String(fd.get("categorySlug") ?? "");
  const top = getTop(categorySlug);
  const price = Math.max(0, parseInt(String(fd.get("price") ?? "0"), 10) || 0);
  if (!name || !top || price <= 0) redirect(`/admin/products/${id ?? "new"}?e=1`);
  const sub = String(fd.get("subcategorySlug") ?? "");
  const compare = parseInt(String(fd.get("comparePrice") ?? ""), 10);
  const specs = list(fd.get("specs"), /\n/)
    .map((l) => {
      const i = l.indexOf(":");
      return i > 0 ? { label: l.slice(0, i).trim(), value: l.slice(i + 1).trim() } : null;
    })
    .filter((x): x is { label: string; value: string } => !!x && !!x.value);
  const flash = String(fd.get("flashSaleEndsAt") ?? "");
  const data = {
    name,
    categorySlug: top.slug,
    subcategorySlug: top.subs.some((s) => s.slug === sub) ? sub : null,
    price,
    comparePrice: Number.isFinite(compare) && compare > price ? compare : null,
    description: String(fd.get("description") ?? "").trim(),
    specs,
    colors: list(fd.get("colors"), /[,\n]/),
    sizes: list(fd.get("sizes"), /[,\n]/),
    images: list(fd.get("images"), /\n/),
    stock: Math.max(0, parseInt(String(fd.get("stock") ?? "0"), 10) || 0),
    isActive: fd.get("isActive") === "on",
    isNew: fd.get("isNew") === "on",
    isFeatured: fd.get("isFeatured") === "on",
    sareeEligible: fd.get("sareeEligible") === "on",
    comboEligible: fd.get("comboEligible") === "on",
    flashSaleEndsAt: flash ? new Date(flash) : null,
  };
  if (id) {
    await db.update(products).set({ ...data, isSample: false }).where(eq(products.id, id));
  } else {
    let slug = slugify(name) || "product";
    const [clash] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
    if (clash) slug = `${slug}-${randomCode(4).toLowerCase()}`;
    await db.insert(products).values({ ...data, slug });
  }
  redirect("/admin/products");
}

export async function deleteProduct(fd: FormData) {
  await guard();
  await db.delete(products).where(eq(products.id, Number(fd.get("id"))));
  redirect("/admin/products");
}

export async function removeSampleProducts() {
  await guard();
  await db.delete(products).where(eq(products.isSample, true));
  redirect("/admin/products");
}

/* ---------- coupons ---------- */

export async function createCoupon(fd: FormData) {
  await guard();
  const code = String(fd.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const type = fd.get("type") === "fixed" ? "fixed" : "percent";
  const value = parseInt(String(fd.get("value") ?? ""), 10);
  if (!code || !(value > 0) || (type === "percent" && value > 100)) redirect("/admin/coupons?e=1");
  const min = parseInt(String(fd.get("minSubtotal") ?? "0"), 10) || 0;
  const max = parseInt(String(fd.get("maxUses") ?? ""), 10);
  const exp = String(fd.get("expiresAt") ?? "");
  try {
    await db.insert(coupons).values({
      code,
      type,
      value,
      minSubtotal: min,
      maxUses: Number.isFinite(max) && max > 0 ? max : null,
      expiresAt: exp ? new Date(`${exp}T23:59:59+06:00`) : null,
      isPublic: fd.get("isPublic") === "on",
      description: String(fd.get("description") ?? "").trim() || null,
    });
  } catch {
    redirect("/admin/coupons?e=2");
  }
  redirect("/admin/coupons");
}

export async function toggleCoupon(fd: FormData) {
  await guard();
  const id = Number(fd.get("id"));
  await db.update(coupons).set({ isActive: fd.get("active") === "1" }).where(eq(coupons.id, id));
  redirect("/admin/coupons");
}

export async function deleteCoupon(fd: FormData) {
  await guard();
  await db.delete(coupons).where(eq(coupons.id, Number(fd.get("id"))));
  redirect("/admin/coupons");
}

/* ---------- reviews / inbox ---------- */

export async function moderateReview(fd: FormData) {
  await guard();
  const id = Number(fd.get("id"));
  const status = String(fd.get("status"));
  if (status === "delete") await db.delete(reviews).where(eq(reviews.id, id));
  else if (["approved", "rejected", "pending"].includes(status))
    await db.update(reviews).set({ status }).where(eq(reviews.id, id));
  redirect("/admin/reviews");
}

export async function messageAction(fd: FormData) {
  await guard();
  const id = Number(fd.get("id"));
  if (fd.get("op") === "delete") await db.delete(messages).where(eq(messages.id, id));
  else await db.update(messages).set({ isRead: true }).where(eq(messages.id, id));
  redirect("/admin/inbox");
}

export async function deleteSubscriber(fd: FormData) {
  await guard();
  await db.delete(subscribers).where(eq(subscribers.id, Number(fd.get("id"))));
  redirect("/admin/inbox");
}

/* ---------- settings ---------- */

export async function saveSettings(fd: FormData) {
  await guard();
  const toggles = ["codEnabled", "promoSareeFreeDelivery", "promoCombo", "promoRepeatReward"];
  for (const key of Object.keys(SETTING_DEFAULTS)) {
    if (key === "onlinePaymentEnabled") continue;
    if (toggles.includes(key)) {
      await setRaw(key, fd.get(key) === "on" ? "1" : "0");
      continue;
    }
    let v = String(fd.get(key) ?? "").trim();
    if (key === "whatsapp") v = v.replace(/[^\d]/g, "");
    if (key === "metaPixelId") v = v.replace(/\D/g, "");
    if (key === "facebookUrl" && v && !/^https?:\/\//i.test(v)) v = `https://${v}`;
    await setRaw(key, v);
  }
  redirect("/admin/settings?saved=1");
}
