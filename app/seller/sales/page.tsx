import { chatGPTSignInPath, chatGPTSignOutPath, getChatGPTUser } from "@/app/chatgpt-auth";
import { isSeller } from "@/lib/server/seller-auth";
import Link from "next/link";
import SalesDashboard from "./sales-dashboard";

export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const user = await getChatGPTUser();
  if (!user) return <main className="seller-gate"><div><Link className="gate-brand" href="/">Kawan, Makan Lah!</Link><h1>Seller sign in</h1><p>Sign in with an approved seller account to view sales.</p><a className="gate-button" href={chatGPTSignInPath("/seller/sales")} target="_top">Sign in</a></div></main>;
  if (!isSeller(user)) return <main className="seller-gate"><div><Link className="gate-brand" href="/">Kawan, Makan Lah!</Link><h1>No seller access</h1><p>This account is not on the seller list.</p><a className="gate-button" href={chatGPTSignOutPath("/seller/sales")} target="_top">Switch account</a></div></main>;
  return <SalesDashboard sellerEmail={user.email} signOutPath={chatGPTSignOutPath("/seller/sales")} />;
}
