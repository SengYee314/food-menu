import { ApiError, errorResponse, json, readJson } from "@/lib/server/http";
import { requireSeller } from "@/lib/server/seller-auth";
import { database, ensureStall } from "@/lib/server/stall";

export async function POST(request: Request) {
  try {
    await requireSeller();
    const payload = await readJson(request);
    if (payload.confirm !== true) throw new ApiError("INVALID_REQUEST", "Confirm the stock reset first.", 400);
    const db = database();
    await ensureStall(db);
    const timestamp = new Date().toISOString();
    await db.batch([
      db.prepare("UPDATE orders SET status = 'cancelled', cancelled_at = ?, updated_at = ?, version = version + 1 WHERE session_id = (SELECT session_id FROM stall_settings WHERE id = 1) AND status IN ('received', 'preparing', 'ready')")
        .bind(timestamp, timestamp),
      db.prepare("UPDATE order_lines SET reserved_quantity = 0 WHERE reserved_quantity != 0"),
      db.prepare("UPDATE menu_items SET remaining = opening_stock, available = 1"),
      db.prepare("UPDATE stall_settings SET session_id = session_id + 1 WHERE id = 1"),
    ]);
    return json({ reset: true });
  } catch (error) {
    return errorResponse(error);
  }
}
