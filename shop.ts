"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
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
import { getSettings } from "@/lib/settings";
import { computeTotals, promoConfig, type PriceLine } from "@/lib/pricing";
import { normalizePhone } from "@/lib/format";
import { validateCoupon } from "@/lib/coupons";

export type OrderInput = {
  customerName: string;
  phone: string;
  email?: string;
  address: string;
  zone: string;
  note?: string;
  couponCode?: string;
  items: { productId: number; qty: number; color?: string; size?: string; combo?: boolean }[];
};

export type OrderResult =
  | { ok: true; orderNo: string }
  | { ok: false; error: string };

export type CouponCheck =
  | { ok: true; code: string; type: string; value: number; description: string }
  | { ok: false; error: string };

export async function checkCoupon(
  code: string,
  phoneRaw: string,
  subtotal: number,
): Promise<CouponCheck> {
  const phone = normalizePhone(phoneRaw);
  const r = await validateCoupon(code, phone, subtotal);
  if (!r.ok) return r;
  const c = r.coupon;
  return {
    ok: true,
    code: c.code,
    type: c.type,
    value: c.value,
    description: c.type === "percent" ? `${c.value}% off` : `৳${c.value} off`,
  };
}

function makeOrderNo() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `FV-${s}`;
}

export async function placeOrder(input: OrderInput): Promise<OrderResult> {
  const s = await getSettings();
  if (s.codEnabled !== "1")
    return { ok: false, error: "Ordering is currently unavailable. Please contact us." };

  const name = (input.customerName ?? "").trim();
  const address = (input.address ?? "").trim();
  const phone = normalizePhone(input.phone ?? "");
  if (name.length < 2) return { ok: false, error: "Please enter your full name." };
  if (!phone)
    return { ok: false, error: "Please enter a valid Bangladeshi mobile number (e.g. 01XXXXXXXXX)." };
  if (address.length < 10)
    return { ok: false, error: "Please enter your full delivery address." };
  const zone = input.zone === "outside" ? "outside" : "dhaka";
  if (!input.items?.length) return { ok: false, error: "Your cart is empty." };
  if (input.items.length > 40) return { ok: false, error: "Too many items in one order." };

  const ids = [...new Set(input.items.map((i) => Number(i.productId)))];
  const rows = await db.select().from(products).where(inArray(products.id, ids));
  const byId = new Map(rows.map((p) => [p.id, p]));

  // Aggregate quantity per product to check stock
  const qtyByProduct = new Map<number, number>();
  const lines: (PriceLine & {
    productId: number;
    name: string;
    slug: string;
    image: string | null;
    color: string | null;
    size: string | null;
  })[] = [];

  for (const it of input.items) {
    const p = byId.get(Number(it.productId));
    const qty = Math.floor(Number(it.qty));
    if (!p || !p.isActive)
      return { ok: false, error: "One of the items in your cart is no longer available." };
    if (!(qty >= 1 && qty <= 20)) return { ok: false, error: "Invalid quantity." };
    if (p.colors.length && (!it.color || !p.colors.includes(it.color)))
      return { ok: false, error: `Please choose a colour for ${p.name}.` };
    if (p.sizes.length && (!it.size || !p.sizes.includes(it.size)))
      return { ok: false, error: `Please choose a size for ${p.name}.` };
    qtyByProduct.set(p.id, (qtyByProduct.get(p.id) ?? 0) + qty);
    lines.push({
      productId: p.id,
      name: p.name,
      slug: p.slug,
      image: p.images[0] ?? null,
      price: p.price,
      qty,
      color: it.color || null,
      size: it.size || null,
      sareeEligible: p.sareeEligible,
      comboEligible: p.comboEligible,
      combo: !!it.combo && p.comboEligible,
    });
  }
  for (const [pid, q] of qtyByProduct) {
    const p = byId.get(pid)!;
    if (q > p.stock)
      return {
        ok: false,
        error: p.stock > 0 ? `Only ${p.stock} of "${p.name}" left in stock.` : `"${p.name}" is out of stock.`,
      };
  }

  const cfg = promoConfig(s);
  const preTotals = computeTotals(lines, zone, cfg, null);
  let couponRow = null as null | typeof coupons.$inferSelect;
  if (input.couponCode?.trim()) {
    const r = await validateCoupon(
      input.couponCode,
      phone,
      preTotals.subtotal - preTotals.comboDiscount,
    );
    if (!r.ok) return r;
    couponRow = r.coupon;
  }
  const totals = computeTotals(
    lines,
    zone,
    cfg,
    couponRow ? { type: couponRow.type, value: couponRow.value } : null,
  );

  let orderNo = makeOrderNo();
  try {
    const created = await db.transaction(async (tx) => {
      // lock coupon usage atomically
      if (couponRow) {
        const upd = await tx
          .update(coupons)
          .set({ usedCount: sql`${coupons.usedCount} + 1` })
          .where(
            and(
              eq(coupons.id, couponRow.id),
              sql`(${coupons.maxUses} is null or ${coupons.usedCount} < ${coupons.maxUses})`,
            ),
          )
          .returning({ id: coupons.id });
        if (!upd.length) throw new Error("COUPON_USED");
      }
      // decrement stock atomically
      for (const [pid, q] of qtyByProduct) {
        const upd = await tx
          .update(products)
          .set({ stock: sql`${products.stock} - ${q}` })
          .where(and(eq(products.id, pid), sql`${products.stock} >= ${q}`))
          .returning({ id: products.id });
        if (!upd.length) throw new Error("STOCK");
      }
      let order;
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          [order] = await tx
            .insert(orders)
            .values({
              orderNo,
              customerName: name,
              phone,
              email: input.email?.trim() || null,
              address,
              zone,
              note: input.note?.trim() || null,
              paymentMethod: "cod",
              subtotal: totals.subtotal,
              deliveryFee: totals.deliveryFee,
              comboDiscount: totals.comboDiscount,
              couponCode: couponRow?.code ?? null,
              couponDiscount: totals.couponDiscount,
              total: totals.total,
              freeDelivery: totals.freeDelivery,
            })
            .returning();
          break;
        } catch (e) {
          if (attempt === 4) throw e;
          orderNo = makeOrderNo();
        }
      }
      await tx.insert(orderItems).values(
        lines.map((l) => ({
          orderId: order!.id,
          productId: l.productId,
          name: l.name,
          slug: l.slug,
          image: l.image,
          price: l.price,
          qty: l.qty,
          color: l.color,
          size: l.size,
          isCombo: l.combo,
        })),
      );
      return order!;
    });
    return { ok: true, orderNo: created.orderNo };
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "COUPON_USED") return { ok: false, error: "This coupon has already been used." };
    if (m === "STOCK") return { ok: false, error: "Sorry, an item just went out of stock." };
    console.error("placeOrder failed", e);
    return { ok: false, error: "Something went wrong placing your order. Please try again." };
  }
}

export type SimpleResult = { ok: boolean; message: string };

export async function submitReview(_prev: SimpleResult | null, fd: FormData): Promise<SimpleResult> {
  const orderNo = String(fd.get("orderNo") ?? "").trim().toUpperCase();
  const phone = normalizePhone(String(fd.get("phone") ?? ""));
  const productId = Number(fd.get("productId"));
  const rating = Number(fd.get("rating"));
  const comment = String(fd.get("comment") ?? "").trim();
  if (!orderNo || !phone) return { ok: false, message: "Enter your order number and the phone number used for the order." };
  if (!(rating >= 1 && rating <= 5)) return { ok: false, message: "Please choose a rating from 1 to 5." };
  if (comment.length < 5) return { ok: false, message: "Please write a short review." };
  if (comment.length > 1000) return { ok: false, message: "Review is too long." };

  const [o] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.orderNo, orderNo), eq(orders.phone, phone)))
    .limit(1);
  if (!o || o.status !== "delivered")
    return { ok: false, message: "We could only find a delivered order matching these details. Reviews open once your order is delivered." };
  const [item] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.orderId, o.id), eq(orderItems.productId, productId)))
    .limit(1);
  if (!item) return { ok: false, message: "This product is not part of that order." };
  const [dupe] = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.orderId, o.id), eq(reviews.productId, productId)))
    .limit(1);
  if (dupe) return { ok: false, message: "You have already reviewed this product for that order." };
  await db.insert(reviews).values({
    productId,
    orderId: o.id,
    customerName: o.customerName.split(" ")[0] || o.customerName,
    rating,
    comment,
  });
  return { ok: true, message: "Thank you! Your review will appear after our team approves it." };
}

export async function subscribe(_prev: SimpleResult | null, fd: FormData): Promise<SimpleResult> {
  const raw = String(fd.get("contact") ?? "").trim();
  const phone = normalizePhone(raw);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  if (!phone && !emailOk)
    return { ok: false, message: "Enter a valid email address or mobile number." };
  await db
    .insert(subscribers)
    .values({ contact: (phone ?? raw).toLowerCase() })
    .onConflictDoNothing();
  return { ok: true, message: "Thanks for subscribing! We'll keep you posted." };
}

export async function sendMessage(_prev: SimpleResult | null, fd: FormData): Promise<SimpleResult> {
  const name = String(fd.get("name") ?? "").trim();
  const contact = String(fd.get("contact") ?? "").trim();
  const body = String(fd.get("body") ?? "").trim();
  if (name.length < 2 || contact.length < 5 || body.length < 5)
    return { ok: false, message: "Please fill in your name, phone/email and message." };
  if (body.length > 3000) return { ok: false, message: "Message is too long." };
  await db.insert(messages).values({ name, contact, body });
  return { ok: true, message: "Message sent. We'll get back to you soon." };
}
