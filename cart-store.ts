"use client";

import { useSyncExternalStore } from "react";

export type CartItem = {
  key: string;
  productId: number;
  slug: string;
  name: string;
  price: number;
  image: string | null;
  qty: number;
  color?: string;
  size?: string;
  sareeEligible: boolean;
  comboEligible: boolean;
  combo: boolean;
  maxStock: number;
};

const KEY = "favora_cart_v1";
const EMPTY: CartItem[] = [];
let cache: CartItem[] = EMPTY;
let cacheRaw: string | null = null;
const listeners = new Set<() => void>();

function read(): CartItem[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(KEY);
  if (raw === cacheRaw) return cache;
  cacheRaw = raw;
  try {
    const parsed = raw ? (JSON.parse(raw) as CartItem[]) : EMPTY;
    cache = Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}

function write(items: CartItem[]) {
  const raw = JSON.stringify(items);
  window.localStorage.setItem(KEY, raw);
  cacheRaw = raw;
  cache = items;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useCart(): CartItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function makeKey(p: { productId: number; color?: string; size?: string; combo: boolean }) {
  return `${p.productId}|${p.color ?? ""}|${p.size ?? ""}|${p.combo ? 1 : 0}`;
}

export function addToCart(item: Omit<CartItem, "key">) {
  const key = makeKey(item);
  const items = [...read()];
  const i = items.findIndex((x) => x.key === key);
  if (i >= 0) {
    items[i] = { ...items[i], qty: Math.min(items[i].qty + item.qty, Math.max(1, item.maxStock), 20) };
  } else {
    items.push({ ...item, key, qty: Math.min(item.qty, 20) });
  }
  write(items);
}

export function setQty(key: string, qty: number) {
  const items = read()
    .map((x) => (x.key === key ? { ...x, qty: Math.max(0, Math.min(qty, x.maxStock || 20, 20)) } : x))
    .filter((x) => x.qty > 0);
  write(items);
}

export function removeItem(key: string) {
  write(read().filter((x) => x.key !== key));
}

export function clearCart() {
  write([]);
}

export function cartCount(items: CartItem[]) {
  return items.reduce((s, i) => s + i.qty, 0);
}
