import { cache } from "react";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { db } from "@/db";
import { ensureSeeded } from "@/db/seed";
import { orderItems, orders, products, reviews, type Product } from "@/db/schema";

export type ProductQuery = {
  category?: string;
  sub?: string;
  q?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: string;
  onOffer?: boolean;
  inStock?: boolean;
  isNew?: boolean;
  featured?: boolean;
  comboOnly?: boolean;
  flashOnly?: boolean;
  excludeId?: number;
  limit?: number;
  offset?: number;
};

export async function getProducts(opts: ProductQuery = {}): Promise<Product[]> {
  await ensureSeeded();
  const c: (SQL | undefined)[] = [eq(products.isActive, true)];
  if (opts.category) c.push(eq(products.categorySlug, opts.category));
  if (opts.sub) c.push(eq(products.subcategorySlug, opts.sub));
  if (opts.q) {
    const like = `%${opts.q.replace(/[%_]/g, "")}%`;
    c.push(or(ilike(products.name, like), ilike(products.description, like)));
  }
  if (opts.minPrice !== undefined) c.push(gte(products.price, opts.minPrice));
  if (opts.maxPrice !== undefined) c.push(lte(products.price, opts.maxPrice));
  if (opts.onOffer)
    c.push(and(isNotNull(products.comparePrice), sql`${products.comparePrice} > ${products.price}`));
  if (opts.inStock) c.push(gt(products.stock, 0));
  if (opts.isNew) c.push(eq(products.isNew, true));
  if (opts.featured) c.push(eq(products.isFeatured, true));
  if (opts.comboOnly) c.push(eq(products.comboEligible, true), gt(products.stock, 0));
  if (opts.flashOnly) c.push(gt(products.flashSaleEndsAt, new Date()));
  if (opts.excludeId) c.push(ne(products.id, opts.excludeId));

  const order =
    opts.sort === "price-asc"
      ? asc(products.price)
      : opts.sort === "price-desc"
        ? desc(products.price)
        : desc(products.createdAt);

  const q = db
    .select()
    .from(products)
    .where(and(...c))
    .orderBy(order, desc(products.id))
    .limit(opts.limit ?? 60)
    .offset(opts.offset ?? 0);
  return q;
}

export const getProductBySlug = cache(async (slug: string) => {
  await ensureSeeded();
  const [p] = await db.select().from(products).where(eq(products.slug, slug)).limit(1);
  return p && p.isActive ? p : null;
});

export async function getProductsByIds(ids: number[]) {
  if (!ids.length) return [];
  return db.select().from(products).where(inArray(products.id, ids));
}

export async function getRelated(p: Product, limit = 4) {
  const same = await getProducts({
    category: p.categorySlug,
    excludeId: p.id,
    limit,
  });
  if (same.length >= limit) return same;
  const more = await getProducts({ excludeId: p.id, limit: limit * 2 });
  const seen = new Set(same.map((x) => x.id));
  return [...same, ...more.filter((x) => !seen.has(x.id))].slice(0, limit);
}

/** Best sellers derived only from real (non-cancelled) orders. */
export async function getBestSellers(limit = 4): Promise<Product[]> {
  const rows = await db
    .select({ id: orderItems.productId, qty: sql<number>`sum(${orderItems.qty})` })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(and(ne(orders.status, "cancelled"), isNotNull(orderItems.productId)))
    .groupBy(orderItems.productId)
    .orderBy(desc(sql`sum(${orderItems.qty})`))
    .limit(limit);
  const ids = rows.map((r) => r.id!).filter(Boolean);
  if (!ids.length) return [];
  const ps = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.isActive, true)));
  return ids.map((id) => ps.find((p) => p.id === id)).filter((p): p is Product => !!p);
}

/** Products that real customers have ordered together with other products. */
export async function getBoughtTogether(limit = 4): Promise<Product[]> {
  const res = await db.execute(sql`
    select b.product_id as id, count(*)::int as c
    from order_items a
    join order_items b on a.order_id = b.order_id and a.product_id <> b.product_id
    join orders o on o.id = a.order_id and o.status <> 'cancelled'
    where b.product_id is not null
    group by b.product_id
    order by c desc
    limit ${limit}`);
  const ids = (res.rows as { id: number }[]).map((r) => r.id);
  if (!ids.length) return [];
  const ps = await db
    .select()
    .from(products)
    .where(and(inArray(products.id, ids), eq(products.isActive, true)));
  return ids.map((id) => ps.find((p) => p.id === id)).filter((p): p is Product => !!p);
}

export type ReviewRow = {
  id: number;
  customerName: string;
  rating: number;
  comment: string;
  createdAt: Date;
  productName: string;
  productSlug: string;
};

export async function getApprovedReviews(opts: { productId?: number; limit?: number } = {}) {
  const rows = await db
    .select({
      id: reviews.id,
      customerName: reviews.customerName,
      rating: reviews.rating,
      comment: reviews.comment,
      createdAt: reviews.createdAt,
      productName: products.name,
      productSlug: products.slug,
    })
    .from(reviews)
    .innerJoin(products, eq(products.id, reviews.productId))
    .where(
      and(
        eq(reviews.status, "approved"),
        opts.productId ? eq(reviews.productId, opts.productId) : undefined,
      ),
    )
    .orderBy(desc(reviews.createdAt))
    .limit(opts.limit ?? 50);
  return rows as ReviewRow[];
}

export function ratingSummary(rows: { rating: number }[]) {
  if (!rows.length) return null;
  const avg = rows.reduce((s, r) => s + r.rating, 0) / rows.length;
  return { avg: Math.round(avg * 10) / 10, count: rows.length };
}
