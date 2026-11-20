import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export type Spec = { label: string; value: string };

export const products = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    categorySlug: text("category_slug").notNull(),
    subcategorySlug: text("subcategory_slug"),
    price: integer("price").notNull(),
    comparePrice: integer("compare_price"),
    description: text("description").notNull().default(""),
    specs: jsonb("specs").$type<Spec[]>().notNull().default([]),
    colors: text("colors").array().notNull().default([]),
    sizes: text("sizes").array().notNull().default([]),
    images: text("images").array().notNull().default([]),
    stock: integer("stock").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    isNew: boolean("is_new").notNull().default(false),
    isFeatured: boolean("is_featured").notNull().default(false),
    sareeEligible: boolean("saree_eligible").notNull().default(false),
    comboEligible: boolean("combo_eligible").notNull().default(true),
    flashSaleEndsAt: timestamp("flash_sale_ends_at"),
    isSample: boolean("is_sample").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("products_category_idx").on(t.categorySlug)],
);

export const orders = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNo: text("order_no").notNull().unique(),
    customerName: text("customer_name").notNull(),
    phone: text("phone").notNull(),
    email: text("email"),
    address: text("address").notNull(),
    zone: text("zone").notNull().default("dhaka"),
    note: text("note"),
    paymentMethod: text("payment_method").notNull().default("cod"),
    subtotal: integer("subtotal").notNull(),
    deliveryFee: integer("delivery_fee").notNull().default(0),
    comboDiscount: integer("combo_discount").notNull().default(0),
    couponCode: text("coupon_code"),
    couponDiscount: integer("coupon_discount").notNull().default(0),
    total: integer("total").notNull(),
    freeDelivery: boolean("free_delivery").notNull().default(false),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    deliveredAt: timestamp("delivered_at"),
  },
  (t) => [index("orders_phone_idx").on(t.phone)],
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: integer("product_id"),
  name: text("name").notNull(),
  slug: text("slug"),
  image: text("image"),
  price: integer("price").notNull(),
  qty: integer("qty").notNull(),
  color: text("color"),
  size: text("size"),
  isCombo: boolean("is_combo").notNull().default(false),
});

export const coupons = pgTable("coupons", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type").notNull().default("percent"), // percent | fixed
  value: integer("value").notNull(),
  minSubtotal: integer("min_subtotal").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isPublic: boolean("is_public").notNull().default(false),
  phone: text("phone"),
  maxUses: integer("max_uses"),
  usedCount: integer("used_count").notNull().default(0),
  expiresAt: timestamp("expires_at"),
  source: text("source").notNull().default("manual"), // manual | repeat_reward
  issuedForOrderId: integer("issued_for_order_id"),
  description: text("description"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull(),
  customerName: text("customer_name").notNull(),
  rating: integer("rating").notNull(),
  comment: text("comment").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contact: text("contact").notNull(),
  body: text("body").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const subscribers = pgTable("subscribers", {
  id: serial("id").primaryKey(),
  contact: text("contact").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull().default(""),
});

export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type Coupon = typeof coupons.$inferSelect;
