import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { isSeller } from "@/lib/server/seller-auth";
import SellerDashboard from "./seller-dashboard";

export const dynamic = "force-dynamic";

export default async function SellerPage() {
  const user = await getChatGPTUser();
  if (!user) return <main className="seller-gate"><div><a className="gate-brand" href="/">Kawan, Makan Lah!</a><h1>Seller sign in</h1><p>Sign in with an approved seller account to manage orders.</p><a className="gate-button" href={chatGPTSignInPath("/seller")} target="_top">Sign in</a></div></main>;
  if (!isSeller(user)) return <main className="seller-gate"><div><a className="gate-brand" href="/">Kawan, Makan Lah!</a><h1>No seller access</h1><p>This account is not on the seller list.</p><a className="gate-button" href={chatGPTSignOutPath("/seller")} target="_top">Switch account</a></div></main>;
  return <SellerDashboard sellerEmail={user.email} signOutPath={chatGPTSignOutPath("/seller")} />;
}
