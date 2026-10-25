import { errorResponse, json } from "@/lib/server/http";
import { listOrders } from "@/lib/server/orders";
import { requireSeller } from "@/lib/server/seller-auth";
import { database, readMenu } from "@/lib/server/stall";

export async function GET() {
  try {
    await requireSeller();
    const db = database();
    const [menu, orders] = await Promise.all([readMenu(db), listOrders(db)]);
    return json({ ...menu, orders });
  } catch (error) {
    return errorResponse(error);
  }
}
