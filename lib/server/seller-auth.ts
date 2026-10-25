import { env } from "cloudflare:workers";
import { getChatGPTUser, type ChatGPTUser } from "@/app/chatgpt-auth";
import { ApiError } from "./http";

const OWNER_ID = "fe2e6adc-2fa9-49cb-b745-fd0551e594e6";
const OWNER_EMAIL = "sengyee314@snu.ac.kr";

export function isSeller(user: ChatGPTUser | null): boolean {
  if (!user) return false;
  if (user.userId === OWNER_ID || user.email.toLowerCase() === OWNER_EMAIL) return true;
  const extra = (env as typeof env & { SELLER_EMAILS?: string }).SELLER_EMAILS ?? "";
  if (extra.split(",").map((email) => email.trim().toLowerCase()).includes(user.email.toLowerCase())) return true;
  return process.env.NODE_ENV === "development" && user.email === "seedy@sites.test";
}

export async function requireSeller(): Promise<ChatGPTUser> {
  const user = await getChatGPTUser();
  if (!user) throw new ApiError("UNAUTHORIZED", "Sign in to manage orders.", 401);
  if (!isSeller(user)) throw new ApiError("FORBIDDEN", "This account cannot manage the stall.", 403);
  return user;
}
