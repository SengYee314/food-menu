import { ApiError, errorResponse, json, readJson } from "@/lib/server/http";
import { requireSeller } from "@/lib/server/seller-auth";
import { database, ensureStall } from "@/lib/server/stall";

export async function POST(request: Request) {
  try {
    await requireSeller();
    const payload = await readJson(request);
    if (typeof payload.paused !== "boolean") throw new ApiError("INVALID_REQUEST", "Choose whether ordering is paused.", 400);
    const db = database();
    await ensureStall(db);
    await db.prepare("UPDATE stall_settings SET paused = ? WHERE id = 1").bind(payload.paused ? 1 : 0).run();
    return json({ paused: payload.paused });
  } catch (error) {
    return errorResponse(error);
  }
}
