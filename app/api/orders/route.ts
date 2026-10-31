import { ApiError, errorResponse, fullErrorMessage, json, readJson } from "@/lib/server/http";
import { checkStock, orderByIdempotency, parseOrderItems, requestFingerprint } from "@/lib/server/orders";
import { database, readMenu } from "@/lib/server/stall";
import { orderRateLimitStatement } from "@/lib/server/rate-limit";

export async function POST(request: Request) {
  try {
    const payload = await readJson(request);
    const items = parseOrderItems(payload.items);
    const note = typeof payload.note === "string" ? payload.note.trim() : "";
    if (note.length > 200) throw new ApiError("INVALID_ORDER", "Keep your note under 200 characters.", 400);
    const idempotencyKey = payload.idempotencyKey;
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(idempotencyKey)) {
      throw new ApiError("INVALID_ORDER", "Please refresh your cart and try again.", 400);
    }

    const db = database();
    const fingerprint = await requestFingerprint(items, note);
    const existing = await orderByIdempotency(db, idempotencyKey);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new ApiError("ORDER_CONFLICT", "This order was already submitted with different items.", 409);
      return json(existing.order);
    }

    const menu = await readMenu(db);
    if (menu.paused) throw new ApiError("ORDERS_PAUSED", "Ordering is paused for now.", 409);
    checkStock(items, menu.items);
    const total = items.reduce((sum, line) => sum + menu.items.find((item) => item.id === line.id)!.price * line.quantity, 0);
    const token = [...crypto.getRandomValues(new Uint8Array(32))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const timestamp = new Date().toISOString();
    const rateLimit = await orderRateLimitStatement(db, request);
    const statements = [
      db.prepare("INSERT INTO orders (token, idempotency_key, request_fingerprint, note, total, status, created_at, updated_at, session_id) SELECT ?, ?, ?, ?, ?, 'received', ?, ?, session_id FROM stall_settings WHERE id = 1").bind(token, idempotencyKey, fingerprint, note, total, timestamp, timestamp),
      ...items.map((line) => {
        const item = menu.items.find((entry) => entry.id === line.id)!;
        return db.prepare("INSERT INTO order_lines (order_id, menu_item_id, name, quantity, reserved_quantity, price) SELECT id, ?, ?, ?, ?, ? FROM orders WHERE token = ?")
          .bind(item.id, item.name, line.quantity, line.quantity, item.price, token);
      }),
      ...(rateLimit ? [rateLimit] : []),
    ];

    try {
      // D1 batch is transactional. The order-line migration trigger reserves each
      // portion and aborts the whole batch if any concurrent buyer took the last one.
      await db.batch(statements);
    } catch (failure) {
      const retry = await orderByIdempotency(db, idempotencyKey);
      if (retry) {
        if (retry.fingerprint !== fingerprint) throw new ApiError("ORDER_CONFLICT", "This order was already submitted with different items.", 409);
        return json(retry.order);
      }
      const message = fullErrorMessage(failure);
      if (message.includes("order_rate_limit_4") || message.includes("order_rate_limits.attempts")) {
        throw new ApiError("TOO_MANY_ORDERS", "Please wait a few minutes before ordering again.", 429);
      }
      if (message.includes("ORDERS_PAUSED")) throw new ApiError("ORDERS_PAUSED", "Ordering is paused for now.", 409);
      if (message.includes("OUT_OF_STOCK")) {
        const current = await readMenu(db);
        checkStock(items, current.items);
        throw new ApiError("OUT_OF_STOCK", "A portion just sold out. Please review your cart.", 409);
      }
      throw failure;
    }
    const created = await orderByIdempotency(db, idempotencyKey);
    if (!created) throw new Error("Created order was not found");
    return json(created.order, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
