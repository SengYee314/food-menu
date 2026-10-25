import { database, readMenu } from "@/lib/server/stall";
import { errorResponse, json } from "@/lib/server/http";

export async function GET() {
  try {
    return json(await readMenu(database()));
  } catch (error) {
    return errorResponse(error);
  }
}
