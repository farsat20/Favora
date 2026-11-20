import { eq } from "drizzle-orm";
import { db } from "@/db";
import { coupons, type Coupon } from "@/db/schema";

export type CouponResult =
  | { ok: true; coupon: Coupon }
  | { ok: false; error: string };

export async function validateCoupon(
  rawCode: string,
  phone: string | null,
  subtotal: number,
): Promise<CouponResult> {
  const code = rawCode.trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a coupon code." };
  const [c] = await db.select().from(coupons).where(eq(coupons.code, code)).limit(1);
  if (!c || !c.isActive) return { ok: false, error: "This coupon code is not valid." };
  if (c.expiresAt && c.expiresAt.getTime() < Date.now())
    return { ok: false, error: "This coupon has expired." };
  if (c.maxUses !== null && c.usedCount >= c.maxUses)
    return { ok: false, error: "This coupon has already been used." };
  if (c.phone) {
    if (!phone) return { ok: false, error: "Enter your phone number first – this coupon is linked to a phone number." };
    if (c.phone !== phone)
      return { ok: false, error: "This coupon belongs to a different phone number." };
  }
  if (subtotal < c.minSubtotal)
    return { ok: false, error: `Minimum order of ৳${c.minSubtotal} required for this coupon.` };
  return { ok: true, coupon: c };
}
