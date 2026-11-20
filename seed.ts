import { db } from "@/db";
import { products, settings } from "@/db/schema";
import { CATEGORIES } from "@/lib/categories";
import { slugify } from "@/lib/format";
import { eq } from "drizzle-orm";

const img = (ids: number[]) => ids.map((i) => `/images/p${i}.jpg`);

const POOLS = {
  saree: img([7326221, 39559946, 14928074, 11629757, 14205210, 7176438, 7176430]),
  hijab: img([2506972, 18308678, 18410346, 33519723, 16943629, 5900122]),
  abaya: img([33539326, 34957209, 35150034, 33108120, 32688174, 32208656, 32347431]),
  panjabi: img([30444853, 36981407, 28050779, 10322690, 36981532]),
  casual: img([19225018, 5010342, 11872747, 5825331, 10326144, 5592273, 18403652]),
  bag: img([22434759, 21897118, 26610519, 5352628, 21897141, 9327162]),
  three: img([20690511, 25184995, 25184999, 20841148]),
  winter: img([6995884, 14903440, 14673793, 14641430]),
};

const COLORS = {
  saree: ["Maroon", "Royal Blue", "Rose Pink", "Emerald Green", "Mustard", "Teal", "Peach"],
  modest: ["Black", "Navy", "Brown", "Olive", "Grey"],
  hijab: ["Dusty Pink", "Beige", "Black", "Sage Green", "Grey", "Maroon"],
  men: ["Black", "Navy", "Grey", "Olive", "White", "Maroon"],
  bag: ["Black", "Tan", "Cream", "Blush Pink"],
  three: ["Peach", "Sky Blue", "Mint", "Lilac"],
  winter: ["Mustard", "Charcoal", "Maroon", "Cream"],
  innerwear: ["Skin", "White", "Black"],
};

type Spec = {
  top: string;
  sub?: string;
  label: string;
  base: number;
  pool: string[];
  colors: string[];
  sizes: string[];
};

const MEN_SIZES = ["S", "M", "L", "XL", "XXL"];
const MODEST_SIZES = ["52", "54", "56", "58"];

const specs: Spec[] = [
  { top: "saree", sub: "hand-print-saree", label: "Hand Print Saree", base: 1450, pool: POOLS.saree, colors: COLORS.saree, sizes: [] },
  { top: "saree", sub: "tant-saree", label: "Tant Saree", base: 1250, pool: POOLS.saree, colors: COLORS.saree, sizes: [] },
  { top: "saree", sub: "indian-saree", label: "Indian Saree", base: 1990, pool: POOLS.saree, colors: COLORS.saree, sizes: [] },
  { top: "saree", sub: "silk-saree", label: "Silk Saree", base: 2450, pool: POOLS.saree, colors: COLORS.saree, sizes: [] },
  { top: "saree", sub: "cotton-saree", label: "Cotton Saree", base: 1150, pool: POOLS.saree, colors: COLORS.saree, sizes: [] },
  { top: "burqa-abaya", sub: "burqa", label: "Burqa", base: 1850, pool: POOLS.abaya, colors: COLORS.modest, sizes: MODEST_SIZES },
  { top: "burqa-abaya", sub: "abaya", label: "Abaya", base: 2250, pool: POOLS.abaya, colors: COLORS.modest, sizes: MODEST_SIZES },
  { top: "burqa-abaya", sub: "sunnah-dress", label: "Sunnah Dress", base: 1650, pool: POOLS.abaya, colors: COLORS.modest, sizes: MODEST_SIZES },
  { top: "hijab-scarf", sub: "hijab", label: "Hijab", base: 350, pool: POOLS.hijab, colors: COLORS.hijab, sizes: [] },
  { top: "hijab-scarf", sub: "niqab", label: "Niqab", base: 250, pool: POOLS.hijab, colors: ["Black"], sizes: [] },
  { top: "hijab-scarf", sub: "scarves", label: "Scarf", base: 450, pool: POOLS.hijab, colors: COLORS.hijab, sizes: [] },
  { top: "three-piece", label: "Three Piece", base: 1650, pool: POOLS.three, colors: COLORS.three, sizes: [] },
  { top: "ladies-bag", label: "Ladies Bag", base: 950, pool: POOLS.bag, colors: COLORS.bag, sizes: [] },
  { top: "womens-innerwear", label: "Women's Innerwear", base: 450, pool: [], colors: COLORS.innerwear, sizes: ["S", "M", "L", "XL"] },
  { top: "mens-collection", sub: "hoodie", label: "Hoodie", base: 1150, pool: POOLS.casual, colors: COLORS.men, sizes: MEN_SIZES },
  { top: "mens-collection", sub: "jacket", label: "Jacket", base: 1650, pool: POOLS.casual, colors: COLORS.men, sizes: MEN_SIZES },
  { top: "mens-collection", sub: "sweater", label: "Sweater", base: 950, pool: POOLS.casual, colors: COLORS.men, sizes: MEN_SIZES },
  { top: "mens-collection", sub: "trouser", label: "Trouser", base: 850, pool: POOLS.casual, colors: COLORS.men, sizes: ["28", "30", "32", "34", "36"] },
  { top: "mens-collection", sub: "jersey", label: "Jersey", base: 650, pool: POOLS.casual, colors: COLORS.men, sizes: MEN_SIZES },
  { top: "mens-collection", sub: "t-shirt", label: "T-Shirt", base: 450, pool: POOLS.casual, colors: COLORS.men, sizes: MEN_SIZES },
  { top: "mens-collection", sub: "shirt", label: "Shirt", base: 850, pool: POOLS.casual, colors: COLORS.men, sizes: MEN_SIZES },
  { top: "mens-collection", sub: "panjabi", label: "Panjabi", base: 1450, pool: POOLS.panjabi, colors: COLORS.men, sizes: ["38", "40", "42", "44"] },
  { top: "winter-collection", label: "Winter Wear", base: 1350, pool: POOLS.winter, colors: COLORS.winter, sizes: ["S", "M", "L", "XL"] },
];

function buildProducts() {
  const rows: (typeof products.$inferInsert)[] = [];
  let i = 0;
  for (const sp of specs) {
    const perSpec = sp.sub ? 2 : 3;
    for (let n = 0; n < perSpec; n++) {
      const color = sp.colors[(n + i) % sp.colors.length];
      const second = sp.colors[(n + i + 1) % sp.colors.length];
      const name = `${sp.label} – ${color}`;
      const price = sp.base + n * 100 - (i % 3) * 50;
      const hasOffer = i % 3 === 0;
      const pl = sp.pool.length;
      rows.push({
        slug: slugify(`${name}-${i + 1}`),
        name,
        categorySlug: sp.top,
        subcategorySlug: sp.sub ?? null,
        price,
        comparePrice: hasOffer ? Math.round((price * 1.15) / 10) * 10 : null,
        description: `${sp.label} in ${color} from the FAVORA ${CATEGORIES.find((c) => c.slug === sp.top)?.name} range. Choose your colour${sp.sizes.length ? " and size" : ""} and order online with Cash on Delivery.`,
        specs: [],
        colors: n % 2 === 0 && sp.colors.length > 1 ? [color, second] : [color],
        sizes: sp.sizes,
        images: pl ? [sp.pool[(n + i) % pl], sp.pool[(n + i + 1) % pl], sp.pool[(n + i + 2) % pl]] : [],
        stock: 25,
        isActive: true,
        isNew: i % 4 === 0,
        isFeatured: i % 5 === 0 || (sp.top === "saree" && n === 0),
        sareeEligible: sp.top === "saree",
        comboEligible: true,
        isSample: true,
      });
      i++;
    }
  }
  return rows;
}

let seeding: Promise<void> | null = null;

/** Loads a sample catalogue once, on a fresh database only. */
export function ensureSeeded(): Promise<void> {
  if (!seeding) {
    seeding = (async () => {
      const flag = await db.select().from(settings).where(eq(settings.key, "_seeded"));
      if (flag.length) return;
      const count = await db.$count(products);
      if (!count) {
        await db.insert(products).values(buildProducts());
      }
      await db
        .insert(settings)
        .values({ key: "_seeded", value: "1" })
        .onConflictDoNothing();
    })().catch((e) => {
      seeding = null;
      throw e;
    });
  }
  return seeding;
}
