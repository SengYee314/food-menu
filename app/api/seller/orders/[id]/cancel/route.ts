import { ApiError, errorResponse, json, readJson } from "@/lib/server/http";
import { orderById } from "@/lib/server/orders";
import { requireSeller } from "@/lib/server/seller-auth";
import { database } from "@/lib/server/stall";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireSeller();
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id < 1) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    const payload = await readJson(request);
    if (!Number.isInteger(payload.expectedVersion) || (payload.expectedVersion as number) < 0) {
      throw new ApiError("INVALID_REQUEST", "Refresh the order before cancelling it.", 400);
    }
    const db = database();
    const order = await orderById(db, id);
    if (!order) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    if (order.status === "collected") throw new ApiError("ORDER_CLOSED", "Collected orders cannot be cancelled.", 409);
    if (order.status === "cancelled") throw new ApiError("ORDER_CLOSED", "This order is already cancelled.", 409);
    if (order.version !== payload.expectedVersion) {
      throw new ApiError("ORDER_CONFLICT", "This order changed on another device. Refresh and try again.", 409);
    }

    const timestamp = new Date().toISOString();
    const nextVersion = order.version + 1;
    const result = await db.batch([
      db.prepare("UPDATE orders SET status = 'cancelled', cancelled_at = ?, updated_at = ?, version = version + 1 WHERE id = ? AND version = ? AND status IN ('received', 'preparing', 'ready') RETURNING id")
        .bind(timestamp, timestamp, id, order.version),
      db.prepare("UPDATE order_lines SET reserved_quantity = 0 WHERE order_id = ? AND reserved_quantity != 0 AND EXISTS (SELECT 1 FROM orders WHERE id = ? AND status = 'cancelled' AND version = ?)")
        .bind(id, id, nextVersion),
    ]);
    if (!result[0].results.length) {
      throw new ApiError("ORDER_CONFLICT", "This order changed on another device. Refresh and try again.", 409);
    }
    const updated = await orderById(db, id);
    if (!updated) throw new Error("Cancelled order was not found");
    return json({ order: updated });
  } catch (error) {
    return errorResponse(error);
  }
}
