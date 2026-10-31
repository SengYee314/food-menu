import { errorResponse, json } from "@/lib/server/http";
import { requireSeller } from "@/lib/server/seller-auth";
import { database, ensureStall } from "@/lib/server/stall";

type SalesRow = {
  id: string;
  name: string;
  image: string;
  category: string;
  order_count: number;
  portions: number;
  amount: number;
};

export async function GET() {
  try {
    await requireSeller();
    const db = database();
    await ensureStall(db);
    const [orders, items] = await db.batch([
      db.prepare("SELECT COUNT(*) AS order_count, COALESCE(SUM(total), 0) AS grand_total FROM orders WHERE session_id = (SELECT session_id FROM stall_settings WHERE id = 1) AND status != 'cancelled'"),
      db.prepare(`SELECT m.id, m.name, m.image, m.category,
        COUNT(DISTINCT ol.order_id) AS order_count,
        COALESCE(SUM(ol.quantity), 0) AS portions,
        COALESCE(SUM(ol.quantity * ol.price), 0) AS amount
        FROM menu_items m LEFT JOIN (
          SELECT ol.* FROM order_lines ol JOIN orders o ON o.id = ol.order_id
          WHERE o.session_id = (SELECT session_id FROM stall_settings WHERE id = 1)
            AND o.status != 'cancelled'
        ) ol ON ol.menu_item_id = m.id
        GROUP BY m.id, m.name, m.image, m.category
        ORDER BY CASE m.id WHEN 'indomie' THEN 0 WHEN 'indomie-egg' THEN 1 WHEN 'roti-canai' THEN 2 WHEN 'teh-o-limau-ais' THEN 3 WHEN 'milo' THEN 4 ELSE 5 END`),
    ]);
    const summary = orders.results[0] as { order_count: number; grand_total: number };
    const rows = items.results as unknown as SalesRow[];
    return json({ orderCount: summary.order_count, grandTotal: summary.grand_total, items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      image: row.image,
      category: row.category,
      orderCount: row.order_count,
      portions: row.portions,
      amount: row.amount,
    })) });
  } catch (error) {
    return errorResponse(error);
  }
}
