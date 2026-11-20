// Pure pricing logic shared by the cart (client) and order placement (server).

export type Settings = Record<string, string>;

export const SETTING_DEFAULTS: Settings = {
  // Contact (empty until the store owner adds them – buttons stay hidden)
  whatsapp: "",
  phone: "",
  email: "",
  address: "",
  facebookUrl: "",
  metaPixelId: "",
  // Delivery
  deliveryDhakaFee: "70",
  deliveryOutsideFee: "130",
  deliveryDhakaDays: "1–3",
  deliveryOutsideDays: "3–5",
  returnWindowDays: "3",
  // Payments
  codEnabled: "1",
  onlinePaymentEnabled: "0", // no gateway integrated – keep off
  // Promotions
  promoSareeFreeDelivery: "1",
  sareeFreeMin: "3",
  promoCombo: "1",
  comboDiscountPerItem: "10",
  comboMinItems: "2",
  promoRepeatReward: "1",
  repeatRewardPercent: "5",
  repeatRewardMonths: "3",
};

export type PromoConfig = {
  feeDhaka: number;
  feeOutside: number;
  sareeFree: boolean;
  sareeMin: number;
  comboOn: boolean;
  comboPerItem: number;
  comboMin: number;
};

const num = (v: string | undefined, d: number) => {
  const n = parseInt(v ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function promoConfig(s: Settings): PromoConfig {
  return {
    feeDhaka: num(s.deliveryDhakaFee, 70),
    feeOutside: num(s.deliveryOutsideFee, 130),
    sareeFree: s.promoSareeFreeDelivery === "1",
    sareeMin: Math.max(1, num(s.sareeFreeMin, 3)),
    comboOn: s.promoCombo === "1",
    comboPerItem: num(s.comboDiscountPerItem, 10),
    comboMin: Math.max(1, num(s.comboMinItems, 2)),
  };
}

export type PriceLine = {
  price: number;
  qty: number;
  sareeEligible: boolean;
  comboEligible: boolean;
  combo: boolean;
};

export type CouponLite = { type: string; value: number } | null;

export type Totals = {
  subtotal: number;
  sareeCount: number;
  freeDelivery: boolean;
  deliveryFee: number;
  comboCount: number;
  comboQualified: boolean;
  comboDiscount: number;
  couponDiscount: number;
  total: number;
};

export function computeTotals(
  lines: PriceLine[],
  zone: string,
  cfg: PromoConfig,
  coupon: CouponLite,
): Totals {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const sareeCount = lines
    .filter((l) => l.sareeEligible)
    .reduce((s, l) => s + l.qty, 0);
  const freeDelivery = cfg.sareeFree && sareeCount >= cfg.sareeMin;
  const baseFee = zone === "outside" ? cfg.feeOutside : cfg.feeDhaka;
  const deliveryFee = lines.length === 0 || freeDelivery ? 0 : baseFee;

  const comboCount = lines
    .filter((l) => l.combo && l.comboEligible)
    .reduce((s, l) => s + l.qty, 0);
  const comboQualified = cfg.comboOn && comboCount >= cfg.comboMin;
  const comboDiscount = comboQualified ? comboCount * cfg.comboPerItem : 0;

  const afterCombo = Math.max(0, subtotal - comboDiscount);
  let couponDiscount = 0;
  if (coupon) {
    couponDiscount =
      coupon.type === "percent"
        ? Math.floor((afterCombo * coupon.value) / 100)
        : Math.min(coupon.value, afterCombo);
  }
  const total = Math.max(0, afterCombo - couponDiscount + deliveryFee);
  return {
    subtotal,
    sareeCount,
    freeDelivery,
    deliveryFee,
    comboCount,
    comboQualified,
    comboDiscount,
    couponDiscount,
    total,
  };
}
