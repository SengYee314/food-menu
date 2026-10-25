"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  remaining: number;
  category: string;
  image: string;
  available?: boolean;
};

type MenuResponse = { items: MenuItem[]; paused: boolean };
type Cart = Record<string, number>;

const descriptions: Record<string, string> = {
  indomie: "Seasoned noodles, made fresh",
  "indomie-egg": "Seasoned noodles with an egg",
  "roti-canai": "Warm, flaky flatbread",
  "teh-o-limau-ais": "Iced black tea with lime",
  milo: "Chocolate malt drink",
};

function won(amount: number) {
  return `₩${amount.toLocaleString("en-US")}`;
}

function quantityLabel(count: number) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

export default function MenuClient() {
  const [menu, setMenu] = useState<MenuResponse | null>(null);
  const [loadError, setLoadError] = useState("");
  const [cart, setCart] = useState<Cart>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ token: string; number: number } | null>(null);
  const submissionKey = useRef<string | null>(null);

  const loadMenu = useCallback(async () => {
    try {
      const response = await fetch("/api/menu", { cache: "no-store" });
      if (!response.ok) throw new Error("Menu unavailable");
      const result = (await response.json()) as MenuResponse;
      setMenu(result);
      setLoadError("");
    } catch {
      setLoadError("We could not load the menu. Check your connection and try again.");
    }
  }, []);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("kml-cart");
      if (saved) setCart(JSON.parse(saved) as Cart);
      const previous = localStorage.getItem("kml-last-order");
      if (previous) setLastOrder(JSON.parse(previous));
    } catch {
      // Storage is optional. Ordering still works when it is blocked.
    }
    void loadMenu();
    const interval = window.setInterval(() => void loadMenu(), 20000);
    return () => window.clearInterval(interval);
  }, [loadMenu]);

  useEffect(() => {
    try { sessionStorage.setItem("kml-cart", JSON.stringify(cart)); } catch { /* optional */ }
  }, [cart]);

  useEffect(() => {
    if (!cartOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCartOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [cartOpen]);

  const lines = useMemo(() => (menu?.items ?? [])
    .filter((item) => (cart[item.id] ?? 0) > 0)
    .map((item) => ({ ...item, quantity: cart[item.id] })), [menu, cart]);
  const count = lines.reduce((sum, item) => sum + item.quantity, 0);
  const estimate = lines.reduce((sum, item) => sum + item.quantity * item.price, 0);

  function changeQuantity(item: MenuItem, delta: number) {
    submissionKey.current = null;
    setSubmitError("");
    setCart((current) => {
      if (delta > 0 && Object.values(current).reduce((sum, quantity) => sum + quantity, 0) >= 8) return current;
      const next = { ...current };
      const quantity = Math.min(item.remaining, Math.max(0, (next[item.id] ?? 0) + delta));
      if (quantity === 0) delete next[item.id];
      else next[item.id] = quantity;
      return next;
    });
  }

  async function submitOrder() {
    if (!lines.length || submitting || menu?.paused) return;
    setSubmitting(true);
    setSubmitError("");
    if (!submissionKey.current) submissionKey.current = crypto.randomUUID();
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map(({ id, quantity }) => ({ id, quantity })),
          note: note.trim(),
          idempotencyKey: submissionKey.current,
        }),
      });
      const result = await response.json() as { error?: string; token: string; number: number };
      if (!response.ok) {
        if (response.status === 409) void loadMenu();
        throw new Error(result.error || "We could not place your order. Please try again.");
      }
      try { sessionStorage.removeItem("kml-cart"); } catch { /* optional storage */ }
      try { localStorage.setItem("kml-last-order", JSON.stringify({ token: result.token, number: result.number })); } catch { /* optional storage */ }
      window.location.assign(`/order/${encodeURIComponent(result.token)}`);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Please try again.");
      setSubmitting(false);
    }
  }

  const foods = (menu?.items ?? []).filter((item) => item.id !== "teh-o-limau-ais" && item.id !== "milo");
  const drinks = (menu?.items ?? []).filter((item) => item.id === "teh-o-limau-ais" || item.id === "milo");

  return (
    <main className="customer-page">
      <div className="menu-shell">
        <header className="menu-header">
          <h1>Kawan, Makan Lah!</h1>
          <p>Pick your food. Pay at the stall.</p>
          {lastOrder && <a className="last-order-link" href={`/order/${encodeURIComponent(lastOrder.token)}`}>Track order #{lastOrder.number}</a>}
        </header>

        {menu?.paused && <div className="menu-notice" role="status">Orders are paused right now. You can still browse the menu.</div>}
        {loadError && <div className="menu-error" role="alert">{loadError} <button onClick={() => void loadMenu()}>Try again</button></div>}

        {!menu && !loadError && <div className="menu-loading" role="status">Loading today&apos;s menu…</div>}

        {menu && <div className="menu-groups">
          <MenuGroup title="Food" items={foods} cart={cart} paused={menu.paused} atLimit={count >= 8} onChange={changeQuantity} />
          <MenuGroup title="Drinks" items={drinks} cart={cart} paused={menu.paused} atLimit={count >= 8} onChange={changeQuantity} />
        </div>}

        <footer className="menu-footer">Made for one good meal. Pick up and pay at the stall.</footer>
      </div>

      {count > 0 && !cartOpen && <div className="cart-bar-wrap">
        <button className="cart-bar" onClick={() => setCartOpen(true)} aria-label={`Review order, ${quantityLabel(count)}, ${won(estimate)}`}>
          <span><strong>{quantityLabel(count)}</strong><small>Review order</small></span>
          <strong>{won(estimate)} <span aria-hidden="true">↗</span></strong>
        </button>
      </div>}

      {cartOpen && <div className="sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setCartOpen(false); }}>
        <section className="order-sheet" role="dialog" aria-modal="true" aria-labelledby="cart-title">
          <div className="sheet-topline">
            <h2 id="cart-title">Your order</h2>
            <button className="close-button" onClick={() => setCartOpen(false)} aria-label="Close order">×</button>
          </div>
          <div className="sheet-scroll">
            {lines.length === 0 ? <p className="empty-message">Your order is empty.</p> : lines.map((item) => <div className="cart-line" key={item.id}>
              <img src={item.image} alt="" />
              <div className="cart-line-name"><strong>{item.name}</strong><span>{won(item.price)} each</span></div>
              <div className="cart-line-end"><strong>{won(item.price * item.quantity)}</strong><QuantityControl item={item} value={item.quantity} atLimit={count >= 8} onChange={changeQuantity} /></div>
            </div>)}
            <label className="note-label" htmlFor="order-note">Note for the stall <span>optional</span></label>
            <textarea id="order-note" value={note} onChange={(event) => { setNote(event.target.value.slice(0, 200)); submissionKey.current = null; }} maxLength={200} placeholder="Anything we should know?" rows={3} />
            <div className="payment-line"><span>Payment</span><strong>Pay at stall</strong></div>
          </div>
          <div className="sheet-footer">
            <div className="total-line"><span>Total</span><strong>{won(estimate)}</strong></div>
            {submitError && <p className="submit-error" role="alert">{submitError}</p>}
            <button className="primary-button place-button" disabled={!lines.length || submitting || menu?.paused} onClick={() => void submitOrder()}>
              {submitting ? "Placing order…" : menu?.paused ? "Ordering paused" : "Place order"}
            </button>
            <p className="sheet-footnote">Up to 8 portions per order. You&apos;ll get a pickup number.</p>
          </div>
        </section>
      </div>}
    </main>
  );
}

function MenuGroup({ title, items, cart, paused, atLimit, onChange }: {
  title: string; items: MenuItem[]; cart: Cart; paused: boolean; atLimit: boolean;
  onChange: (item: MenuItem, delta: number) => void;
}) {
  return <section className="menu-group" aria-label={title}>
    <div className="group-heading"><h2>{title}</h2><span>{items.length} choices</span></div>
    <div className="menu-list">{items.map((item) => {
      const soldOut = item.available === false || item.remaining <= 0;
      const quantity = cart[item.id] ?? 0;
      return <article className={`menu-item ${soldOut ? "is-sold-out" : ""}`} key={item.id}>
        <div className="food-photo"><img src={item.image} alt={item.name} loading={title === "Drinks" ? "lazy" : "eager"} /></div>
        <div className="food-copy">
          <div><h3>{item.name}</h3><p>{item.description || descriptions[item.id]}</p></div>
          <div className="food-bottom">
            <div><strong className="food-price">{won(item.price)}</strong>{soldOut ? <span className="availability sold">Sold out</span> : item.remaining <= 5 ? <span className="availability low">Only a few left</span> : null}</div>
            {quantity > 0 ? <QuantityControl item={item} value={quantity} atLimit={atLimit} onChange={onChange} disabled={paused} /> : <button className="add-button" disabled={soldOut || paused || atLimit} onClick={() => onChange(item, 1)}>{soldOut ? "Sold out" : atLimit ? "Max 8" : "Add"}{!soldOut && !atLimit && <span aria-hidden="true">+</span>}</button>}
          </div>
        </div>
      </article>;
    })}</div>
  </section>;
}

function QuantityControl({ item, value, onChange, disabled = false, atLimit = false }: { item: MenuItem; value: number; onChange: (item: MenuItem, delta: number) => void; disabled?: boolean; atLimit?: boolean }) {
  return <div className="quantity-control" aria-label={`${item.name} quantity`}>
    <button aria-label={`Remove one ${item.name}`} disabled={disabled} onClick={() => onChange(item, -1)}>−</button>
    <span aria-live="polite">{value}</span>
    <button aria-label={`Add one ${item.name}`} disabled={disabled || atLimit || value >= item.remaining} onClick={() => onChange(item, 1)}>+</button>
  </div>;
}
