import type { MetadataRoute } from "next";
import { db } from "@/db";
import { products } from "@/db/schema";
import { CATEGORIES } from "@/lib/categories";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = `${proto}://${host}`;
  const ps = await db.select({ slug: products.slug, at: products.createdAt }).from(products);
  const staticPages = ["", "/shop", "/offers", "/custom-combo", "/about", "/contact", "/faq", "/track", "/delivery-policy", "/return-policy", "/privacy-policy", "/terms"];
  return [
    ...staticPages.map((p) => ({ url: `${base}${p}` })),
    ...CATEGORIES.map((c) => ({ url: `${base}/category/${c.slug}` })),
    ...ps.map((p) => ({ url: `${base}/product/${p.slug}`, lastModified: p.at })),
  ];
}
