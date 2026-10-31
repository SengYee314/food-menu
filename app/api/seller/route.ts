import { errorResponse, json } from "@/lib/server/http";
import { listOrders } from "@/lib/server/orders";
import { requireSeller } from "@/lib/server/seller-auth";
import { database, readMenu } from "@/lib/server/stall";

export async function GET() {
  try {
    await requireSeller();
    const db = database();
    const menu = await readMenu(db);
    const orders = await listOrders(db, menu.sessionId);
    return json({ ...menu, orders });
  } catch (error) {
    return errorResponse(error);
  }
}
