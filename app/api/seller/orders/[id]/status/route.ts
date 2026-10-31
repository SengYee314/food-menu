import { ApiError, errorResponse, json, readJson } from "@/lib/server/http";
import { formatOrder, type OrderStatus } from "@/lib/server/orders";
import { requireSeller } from "@/lib/server/seller-auth";
import { database } from "@/lib/server/stall";

const previous: Record<string, OrderStatus> = {
  preparing: "received",
  ready: "preparing",
  collected: "ready",
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireSeller();
    const { id: rawId } = await context.params;
    const id = Number(rawId);
    if (!Number.isInteger(id) || id < 1) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    const payload = await readJson(request);
    const status = payload.status;
    if (typeof status !== "string" || !(status in previous)) {
      throw new ApiError("INVALID_STATUS", "Choose a valid next step.", 400);
    }
    const db = database();
    const timestamp = new Date().toISOString();
    const timeColumn = status === "preparing" ? "preparing_at" : status === "ready" ? "ready_at" : "collected_at";
    const updated = await db.prepare(`UPDATE orders SET status = ?, updated_at = ?, version = version + 1, ${timeColumn} = ? WHERE id = ? AND status = ? RETURNING id, token, status, note, total, created_at, updated_at, version, preparing_at, ready_at, collected_at`)
      .bind(status, timestamp, timestamp, id, previous[status]).first();
    if (!updated) {
      const current = await db.prepare("SELECT status FROM orders WHERE id = ?").bind(id).first<{ status: string }>();
      if (!current) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
      if (current.status !== status) throw new ApiError("STATUS_CONFLICT", "This order changed on another device. Refresh the queue.", 409);
    }
    const orderRow = await db.prepare("SELECT id, token, status, note, total, created_at, updated_at, version, preparing_at, ready_at, collected_at FROM orders WHERE id = ?").bind(id).first();
    const lines = await db.prepare("SELECT order_id, menu_item_id, name, quantity, reserved_quantity, price FROM order_lines WHERE order_id = ? ORDER BY id").bind(id).all();
    return json({ order: formatOrder(orderRow as never, lines.results as never) });
  } catch (error) {
    return errorResponse(error);
  }
}
