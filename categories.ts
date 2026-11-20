export type SubCategory = { slug: string; name: string };
export type TopCategory = {
  slug: string;
  name: string;
  image: string | null;
  subs: SubCategory[];
  blurb: string;
};

const s = (name: string, slug?: string): SubCategory => ({
  name,
  slug: slug ?? name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
});

export const CATEGORIES: TopCategory[] = [
  {
    slug: "saree",
    name: "Saree",
    image: "/images/p7326221.jpg",
    blurb: "Hand print, tant, silk, cotton and more.",
    subs: [
      s("Hand Print Saree"),
      s("Tant Saree"),
      s("Indian Saree"),
      s("Silk Saree"),
      s("Cotton Saree"),
    ],
  },
  {
    slug: "burqa-abaya",
    name: "Burqa & Abaya",
    image: "/images/p35150034.jpg",
    blurb: "Burqa, abaya and sunnah dress.",
    subs: [s("Burqa"), s("Abaya"), s("Sunnah Dress")],
  },
  {
    slug: "hijab-scarf",
    name: "Hijab & Scarf",
    image: "/images/p2506972.jpg",
    blurb: "Hijab, niqab and scarves.",
    subs: [s("Hijab"), s("Niqab"), s("Scarves")],
  },
  {
    slug: "three-piece",
    name: "Three Piece",
    image: "/images/p20690511.jpg",
    blurb: "Everyday and occasion three piece sets.",
    subs: [],
  },
  {
    slug: "ladies-bag",
    name: "Ladies Bag",
    image: "/images/p22434759.jpg",
    blurb: "Handbags and everyday bags.",
    subs: [],
  },
  {
    slug: "womens-innerwear",
    name: "Women's Innerwear",
    image: null,
    blurb: "Comfortable everyday basics.",
    subs: [],
  },
  {
    slug: "mens-collection",
    name: "Men's Collection",
    image: "/images/p36981407.jpg",
    blurb: "Panjabi, shirts, hoodies and more.",
    subs: [
      s("Hoodie"),
      s("Jacket"),
      s("Sweater"),
      s("Trouser"),
      s("Jersey"),
      s("T-Shirt"),
      s("Shirt"),
      s("Panjabi"),
    ],
  },
  {
    slug: "winter-collection",
    name: "Winter Collection",
    image: "/images/p14903440.jpg",
    blurb: "Stay warm this winter.",
    subs: [],
  },
];

export function getTop(slug: string | null | undefined) {
  return CATEGORIES.find((c) => c.slug === slug);
}

export function getSub(top: string | null | undefined, sub: string | null | undefined) {
  return getTop(top)?.subs.find((x) => x.slug === sub);
}

export function categoryLabel(top: string, sub?: string | null) {
  const t = getTop(top);
  const sb = sub ? getSub(top, sub) : undefined;
  return sb ? `${t?.name} › ${sb.name}` : (t?.name ?? top);
}

export const NAV_LINKS: { href: string; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/shop", label: "Shop All" },
  { href: "/category/saree", label: "Saree" },
  { href: "/category/burqa-abaya", label: "Burqa & Abaya" },
  { href: "/category/hijab-scarf", label: "Hijab & Scarf" },
  { href: "/category/mens-collection", label: "Men's Collection" },
  { href: "/offers", label: "Offers & Deals" },
  { href: "/custom-combo", label: "Custom Combo" },
];
