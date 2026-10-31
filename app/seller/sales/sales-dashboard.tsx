"use client";

import { useCallback, useEffect, useState } from "react";

type ItemSales = { id: string; name: string; image: string; category: string; orderCount: number; portions: number; amount: number };
type SalesData = { orderCount: number; grandTotal: number; items: ItemSales[] };

function won(value: number) { return `₩${value.toLocaleString("en-US")}`; }

export default function SalesDashboard({ sellerEmail, signOutPath }: { sellerEmail: string; signOutPath: string }) {
  const [data, setData] = useState<SalesData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (showBusy = false) => {
    if (showBusy) setBusy(true);
    try {
      const response = await fetch("/api/seller/sales", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Your account no longer has seller access." : "Could not load sales.");
      setData(await response.json() as SalesData);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not load sales.");
    } finally { if (showBusy) setBusy(false); }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    const interval = window.setInterval(() => void refresh(), 5000);
    return () => { window.clearTimeout(timer); window.clearInterval(interval); };
  }, [refresh]);

  return <main className="seller-page">
    <aside className="seller-sidebar">
      <div className="seller-brand"><span className="brand-bowl" aria-hidden="true">◡</span><span>Kawan, Makan Lah!</span></div>
      <nav aria-label="Seller sections"><a href="/seller#orders">Orders</a><a href="/seller#stock">Stock</a><a href="/seller/sales" aria-current="page">Sales</a></nav>
      <div className="seller-account"><span>{sellerEmail}</span><a href={signOutPath} target="_top">Sign out</a></div>
    </aside>
    <div className="seller-main sales-main">
      <header className="seller-topbar"><span>Kawan, Makan Lah!</span><div className="seller-mobile-tabs"><a href="/seller">Orders</a><a href="/seller#stock">Stock</a><a href="/seller/sales" className="selected" aria-current="page">Sales</a></div></header>
      <div className="seller-heading"><div><h1>Sales</h1><p>Since the last stock reset</p></div><button className="outline-button" disabled={busy} onClick={() => void refresh(true)}>{busy ? "Loading…" : "Refresh"}</button></div>
      <p className="sales-explainer">Order value is shown here. Customers pay at the stall, and payment is not recorded on this site.</p>
      {error && <div className="seller-error" role="alert">{error} <button onClick={() => void refresh()}>Retry</button></div>}
      {!data && !error && <p className="seller-loading" role="status">Loading sales…</p>}
      {data && <>
        <section className="sales-summary" aria-label="Sales totals"><div><span>Order value</span><strong>{won(data.grandTotal)}</strong></div><div><span>Orders placed</span><strong>{data.orderCount}</strong></div></section>
        <section className="sales-items" aria-labelledby="sales-items-heading">
          <div className="sales-items-heading"><h2 id="sales-items-heading">By menu item</h2><span>Includes food and drinks</span></div>
          <div className="sales-list">{data.items.map((item) => <article className="sales-item" key={item.id}>
            <img src={item.image} alt="" />
            <div className="sales-item-name"><h3>{item.name}</h3><p>{item.orderCount} {item.orderCount === 1 ? "order" : "orders"} · {item.portions} {item.portions === 1 ? "portion" : "portions"}</p></div>
            <strong>{won(item.amount)}</strong>
          </article>)}</div>
        </section>
      </>}
    </div>
  </main>;
}
