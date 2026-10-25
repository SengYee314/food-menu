import { env } from "cloudflare:workers";
import { ApiError } from "./http";

export type MenuItem = {
  id: string;
  name: string;
  description: string;
  category: "Food" | "Drinks";
  image: string;
  price: number;
  remaining: number;
  available: boolean;
};

type MenuRow = Omit<MenuItem, "available"> & { available: number; opening_stock: number };

const initialMenu = [
  { id: "indomie", name: "Indomie", description: "Classic seasoned noodles", category: "Food", image: "/images/indomie.webp", price: 4000, stock: 20 },
  { id: "indomie-egg", name: "Indomie with egg", description: "Seasoned noodles with egg", category: "Food", image: "/images/indomie-egg.webp", price: 5000, stock: 60 },
  { id: "roti-canai", name: "Roti canai", description: "Flaky, warm flatbread", category: "Food", image: "/images/roti-canai.webp", price: 5000, stock: 40 },
  { id: "teh-o-limau-ais", name: "Teh O Limau Ais", description: "Iced tea with lime", category: "Drinks", image: "/images/teh-o-limau-ais.webp", price: 2000, stock: 50 },
  { id: "milo", name: "Milo", description: "Chocolate malt drink", category: "Drinks", image: "/images/milo.webp", price: 2000, stock: 50 },
] as const;

export function database(): D1Database {
  if (!env.DB) throw new Error("D1 binding DB is unavailable");
  return env.DB;
}

export async function ensureStall(db: D1Database): Promise<void> {
  // The one-day stock is inserted once. INSERT OR IGNORE never resets seller edits or sales.
  const placeholders = initialMenu.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, 1)").join(", ");
  const bindings = initialMenu.flatMap((item) => [
    item.id, item.name, item.description, item.category, item.image,
    item.price, item.stock, item.stock,
  ]);
  await db.batch([
    db.prepare(`INSERT OR IGNORE INTO menu_items (id, name, description, category, image, price, opening_stock, remaining, available) VALUES ${placeholders}`).bind(...bindings),
    db.prepare("INSERT OR IGNORE INTO stall_settings (id, paused) VALUES (1, 0)"),
  ]);
}

export async function readMenu(db: D1Database): Promise<{ items: MenuItem[]; paused: boolean }> {
  await ensureStall(db);
  const [menuResult, settingResult] = await db.batch([
    db.prepare("SELECT id, name, description, category, image, price, remaining, available, opening_stock FROM menu_items ORDER BY CASE id WHEN 'indomie' THEN 0 WHEN 'indomie-egg' THEN 1 WHEN 'roti-canai' THEN 2 WHEN 'teh-o-limau-ais' THEN 3 WHEN 'milo' THEN 4 ELSE 5 END"),
    db.prepare("SELECT paused FROM stall_settings WHERE id = 1"),
  ]);
  const items = (menuResult.results as unknown as MenuRow[]).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    image: row.image,
    price: row.price,
    remaining: row.remaining,
    available: Boolean(row.available),
  }));
  const setting = settingResult.results[0] as { paused?: number } | undefined;
  return { items, paused: Boolean(setting?.paused) };
}

export function requireMenuItem(items: MenuItem[], id: string): MenuItem {
  const item = items.find((entry) => entry.id === id);
  if (!item) throw new ApiError("INVALID_ITEM", "That menu item is unavailable.", 400, { itemId: id });
  return item;
}
