import { ApiError, errorResponse, json } from "@/lib/server/http";
import { orderByToken } from "@/lib/server/orders";
import { database } from "@/lib/server/stall";

export async function GET(_request: Request, context: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await context.params;
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    const order = await orderByToken(database(), token);
    if (!order) throw new ApiError("ORDER_NOT_FOUND", "Order not found.", 404);
    return json({ order });
  } catch (error) {
    return errorResponse(error);
  }
}
