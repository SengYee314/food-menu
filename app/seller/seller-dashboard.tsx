"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Status = "received" | "preparing" | "ready" | "collected" | "cancelled";
type Item = { id: string; name: string; image: string; remaining: number; available: boolean; price: number };
type Order = {
  id: number; number: number; status: Status; note: string; total: number;
  createdAt: string; updatedAt: string; version: number;
  lines: { menuItemId: string; name: string; quantity: number; price: number }[];
};
type SellerData = { orders: Order[]; items: Item[]; paused: boolean };
type Filter = "active" | Status;

const statusLabels: Record<Status, string> = { received: "New", preparing: "Preparing", ready: "Ready", collected: "Collected", cancelled: "Cancelled" };
const nextActions: Partial<Record<Status, { label: string; next: Status }>> = {
  received: { label: "Start preparing", next: "preparing" },
  preparing: { label: "Mark ready", next: "ready" },
  ready: { label: "Mark collected", next: "collected" },
};
function won(value: number) { return `₩${value.toLocaleString("en-US")}`; }
function orderTime(value: string) { const date = new Date(value); return Number.isNaN(date.valueOf()) ? "" : date.toLocaleTimeString("en-KR", { hour: "2-digit", minute: "2-digit" }); }

export default function SellerDashboard({ sellerEmail, signOutPath }: { sellerEmail: string; signOutPath: string }) {
  const [data, setData] = useState<SellerData | null>(null);
  const [filter, setFilter] = useState<Filter>("active");
  const [mobileView, setMobileView] = useState<"orders" | "stock">("orders");
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetNotice, setResetNotice] = useState("");
  const [stockVersion, setStockVersion] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/seller", { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 403 ? "Your account no longer has seller access." : "Could not refresh orders.");
      setData(await response.json() as SellerData);
      setRefreshedAt(new Date());
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not refresh orders.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 5000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); };
  }, [refresh]);

  useEffect(() => {
    const selectSection = () => setMobileView(window.location.hash === "#stock" ? "stock" : "orders");
    window.addEventListener("hashchange", selectSection);
    const timer = window.setTimeout(selectSection, 0);
    return () => { window.removeEventListener("hashchange", selectSection); window.clearTimeout(timer); };
  }, []);

  async function post(path: string, body: object, action: string) {
    setBusy(action); setActionError(""); setResetNotice("");
    try {
      const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        if (response.status === 409) await refresh();
        throw new Error(result.error || "Could not save the change.");
      }
      await refresh();
      return true;
    } catch (failure) {
      setActionError(failure instanceof Error ? failure.message : "Could not save the change.");
      return false;
    } finally { setBusy(""); }
  }

  async function resetStock() {
    if (await post("/api/seller/stock/reset", { confirm: true }, "reset-stock")) {
      setConfirmReset(false);
      setStockVersion((version) => version + 1);
      setResetNotice("New session started. Stock is full and sales are back to zero.");
    }
  }

  async function cancelOrder(order: Order) {
    if (await post(`/api/seller/orders/${order.id}/cancel`, { expectedVersion: order.version }, `cancel-${order.id}`)) {
      setConfirmCancel(null);
    }
  }

  const counts = useMemo(() => {
    const orders = data?.orders ?? [];
    return {
      active: orders.filter((order) => order.status !== "collected" && order.status !== "cancelled").length,
      received: orders.filter((order) => order.status === "received").length,
      preparing: orders.filter((order) => order.status === "preparing").length,
      ready: orders.filter((order) => order.status === "ready").length,
      collected: orders.filter((order) => order.status === "collected").length,
      cancelled: orders.filter((order) => order.status === "cancelled").length,
    };
  }, [data]);
  const visibleOrders = (data?.orders ?? []).filter((order) => filter === "active" ? order.status !== "collected" && order.status !== "cancelled" : order.status === filter);

  return <main className="seller-page">
    <aside className="seller-sidebar">
      <div className="seller-brand"><span className="brand-bowl" aria-hidden="true">◡</span><span>Kawan, Makan Lah!</span></div>
      <nav aria-label="Seller sections"><a href="#orders">Orders</a><a href="#stock">Stock</a><a href="/seller/sales">Sales</a></nav>
      <div className="seller-account"><span>{sellerEmail}</span><a href={signOutPath} target="_top">Sign out</a></div>
    </aside>
    <div className="seller-main">
      <header className="seller-topbar"><span>Kawan, Makan Lah!</span><div className="seller-mobile-tabs"><button className={mobileView === "orders" ? "selected" : ""} onClick={() => setMobileView("orders")}>Orders</button><button className={mobileView === "stock" ? "selected" : ""} onClick={() => setMobileView("stock")}>Stock</button><a href="/seller/sales">Sales</a></div></header>
      <div className="seller-heading">
        <div><h1>{mobileView === "stock" ? "Stock" : "Orders"}</h1><p>{mobileView === "stock" ? "Current portions and availability" : <>One selling day <span aria-hidden="true">·</span> Pay at stall</>}</p></div>
        <div className="seller-heading-actions"><span className="freshness">{refreshedAt ? `Updated ${orderTime(refreshedAt.toISOString())}` : "Connecting"}</span><button className="outline-button" onClick={() => void refresh()}>Refresh</button></div>
      </div>
      {error && <div className="seller-error" role="alert">{error} <button onClick={() => void refresh()}>Retry</button></div>}
      {actionError && <div className="seller-error" role="alert">{actionError}</div>}
      {!data && !error && <p className="seller-loading" role="status">Loading orders and stock…</p>}
      {data && <div className="seller-columns">
        <section id="orders" className={`seller-orders ${mobileView !== "orders" ? "mobile-hidden" : ""}`}>
          <div className="seller-filter" role="group" aria-label="Filter orders">
            {(["active", "received", "preparing", "ready", "collected", "cancelled"] as Filter[]).map((option) => <button key={option} className={filter === option ? "selected" : ""} onClick={() => setFilter(option)} aria-pressed={filter === option}>
              <span>{option === "active" ? "Active" : statusLabels[option]}</span><strong>{counts[option]}</strong>
            </button>)}
          </div>
          <div className="order-queue">
            {visibleOrders.length === 0 && <div className="queue-empty"><strong>{filter === "active" ? "No active orders" : `No ${filter === "received" ? "new" : filter} orders`}</strong><p>New orders will appear here automatically.</p></div>}
            {visibleOrders.map((order) => {
              const action = nextActions[order.status];
              return <article className="seller-order" key={order.id}>
                <div className="seller-order-top"><div><span className="order-number">#{order.number}</span><span className={`status-tag status-${order.status}`}>{statusLabels[order.status]}</span></div><time dateTime={order.createdAt}>{orderTime(order.createdAt)}</time></div>
                <ul className="seller-order-lines">{order.lines.map((line, index) => <li key={`${line.name}-${index}`}><span><b>{line.quantity}×</b> {line.name}</span><strong>{won(line.quantity * line.price)}</strong></li>)}</ul>
                {order.note && <p className="seller-note"><span>Note</span> {order.note}</p>}
                <div className="seller-order-foot"><span>Total <strong>{won(order.total)}</strong></span>{action && <button className="order-action" disabled={!!busy || confirmCancel === order.id} onClick={() => void post(`/api/seller/orders/${order.id}/status`, { status: action.next }, `order-${order.id}`)}>{busy === `order-${order.id}` ? "Saving…" : action.label}</button>}</div>
                {action && <div className="seller-order-secondary"><button disabled={!!busy} onClick={() => setConfirmCancel(confirmCancel === order.id ? null : order.id)}>{confirmCancel === order.id ? "Keep order" : "Cancel order"}</button></div>}
                {confirmCancel === order.id && <div className="cancel-order-confirm" role="group" aria-label={`Confirm cancellation of order ${order.number}`}><p>Cancel order #{order.number}? Its portions return to stock. Ask the customer to place a new order.</p><button disabled={!!busy} onClick={() => void cancelOrder(order)}>{busy === `cancel-${order.id}` ? "Cancelling…" : "Yes, cancel order"}</button></div>}
              </article>;
            })}
          </div>
        </section>
        <section id="stock" className={`seller-stock ${mobileView !== "stock" ? "mobile-hidden" : ""}`}>
          <div className="stock-heading"><div><h2>Portions left</h2><p>Adjust stock as you serve.</p></div><strong>{data.items.filter((item) => item.available && item.remaining > 0).length}/{data.items.length}</strong></div>
          <div className="stock-list">{data.items.map((item) => <StockRow key={`${item.id}-${stockVersion}`} item={item} busy={!!busy} onSave={(body) => post(`/api/seller/menu/${item.id}`, body, `stock-${item.id}`)} />)}</div>
          <div className="pause-control"><div><strong>New orders</strong><p>{data.paused ? "Customers can browse but cannot order." : "Customers can place orders now."}</p></div><button disabled={!!busy} onClick={() => void post("/api/seller/pause", { paused: !data.paused }, "pause")}>{busy === "pause" ? "Saving…" : data.paused ? "Resume" : "Pause"}</button></div>
          <div className="stock-reset">
            <div><strong>Start a new session</strong><p>Restore starting stock and set sales back to zero. Open orders will be cancelled.</p></div>
            {confirmReset ? <div className="stock-reset-confirm" role="group" aria-label="Confirm stock reset">
              <p>Cancel open orders and start new stock and sales?</p>
              <button className="stock-reset-cancel" disabled={!!busy} onClick={() => setConfirmReset(false)}>Cancel</button>
              <button className="stock-reset-submit" disabled={!!busy} onClick={() => void resetStock()}>{busy === "reset-stock" ? "Resetting…" : "Yes, reset stock"}</button>
            </div> : <button className="stock-reset-open" disabled={!!busy} onClick={() => { setResetNotice(""); setConfirmReset(true); }}>Reset stock</button>}
            {resetNotice && <p className="stock-reset-notice" role="status">{resetNotice}</p>}
          </div>
        </section>
      </div>}
    </div>
  </main>;
}

function StockRow({ item, busy, onSave }: { item: Item; busy: boolean; onSave: (body: { remaining?: number; expectedRemaining?: number; available?: boolean }) => Promise<boolean> }) {
  const [quantity, setQuantity] = useState(item.remaining);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (!dirty) setQuantity(item.remaining); }, [item.remaining, dirty]);
  async function save() { if (await onSave({ remaining: quantity, expectedRemaining: item.remaining })) setDirty(false); }
  return <div className="stock-row">
    <img src={item.image} alt="" />
    <div className="stock-row-main"><strong>{item.name}</strong><span>{item.available && item.remaining > 0 ? `${item.remaining} left` : "Sold out"}</span></div>
    <div className="stock-row-actions"><label><span className="sr-only">Portions left for {item.name}</span><input type="number" min="0" max="999" value={quantity} onChange={(event) => { setQuantity(Math.max(0, Math.min(999, Number(event.target.value) || 0))); setDirty(true); }} /></label>{dirty && <button className="stock-save" disabled={busy} onClick={() => void save()}>Save</button>}</div>
    <button className="stock-toggle" disabled={busy} onClick={() => void onSave({ available: !item.available })}>{item.available ? "Mark sold out" : "Make available"}</button>
  </div>;
}
