import { ApiError, errorResponse, json, readJson } from "@/lib/server/http";
import { requireSeller } from "@/lib/server/seller-auth";
import { database, readMenu } from "@/lib/server/stall";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireSeller();
    const { id } = await context.params;
    const db = database();
    const menu = await readMenu(db);
    const item = menu.items.find((entry) => entry.id === id);
    if (!item) throw new ApiError("INVALID_ITEM", "Menu item not found.", 404);
    const payload = await readJson(request);
    const remaining = payload.remaining;
    const available = payload.available;
    const expectedRemaining = payload.expectedRemaining;
    if (remaining === undefined && available === undefined) throw new ApiError("INVALID_STOCK", "Choose stock or availability to change.", 400);
    if (remaining !== undefined && (!Number.isInteger(remaining) || (remaining as number) < 0 || (remaining as number) > 999)) {
      throw new ApiError("INVALID_STOCK", "Portions must be between 0 and 999.", 400);
    }
    if (remaining !== undefined && (!Number.isInteger(expectedRemaining) || (expectedRemaining as number) < 0 || (expectedRemaining as number) > 999)) {
      throw new ApiError("INVALID_STOCK", "Refresh the stock count before changing it.", 400);
    }
    if (available !== undefined && typeof available !== "boolean") throw new ApiError("INVALID_STOCK", "Availability must be on or off.", 400);
    let changed;
    if (remaining !== undefined && available !== undefined) {
      changed = await db.prepare("UPDATE menu_items SET remaining = ?, available = ? WHERE id = ? AND remaining = ?").bind(remaining, available ? 1 : 0, id, expectedRemaining).run();
    } else if (remaining !== undefined) {
      changed = await db.prepare("UPDATE menu_items SET remaining = ? WHERE id = ? AND remaining = ?").bind(remaining, id, expectedRemaining).run();
    } else {
      changed = await db.prepare("UPDATE menu_items SET available = ? WHERE id = ?").bind(available ? 1 : 0, id).run();
    }
    if (remaining !== undefined && changed.meta.changes === 0) {
      const current = await readMenu(db);
      throw new ApiError("STOCK_CONFLICT", "Stock changed while you were editing. Check the new count and try again.", 409, {
        item: current.items.find((entry) => entry.id === id),
      });
    }
    const updated = await readMenu(db);
    return json({ item: updated.items.find((entry) => entry.id === id) });
  } catch (error) {
    return errorResponse(error);
  }
}
