"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

type Status = "received" | "preparing" | "ready" | "collected" | "cancelled";
type Order = {
  number: number;
  token: string;
  status: Status;
  total: number;
  createdAt: string;
  updatedAt: string;
  note?: string | null;
  lines: { name: string; quantity: number; price: number }[];
};

const steps: { key: Status; label: string }[] = [
  { key: "received", label: "Received" },
  { key: "preparing", label: "Preparing" },
  { key: "ready", label: "Ready for pickup" },
  { key: "collected", label: "Collected" },
];

function won(amount: number) { return `₩${amount.toLocaleString("en-US")}`; }

export default function OrderStatus({ token }: { token: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState("");
  const [alertEnabled, setAlertEnabled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const previousStatus = useRef<Status | null>(null);
  const alertEnabledRef = useRef(false);
  const soundContext = useRef<AudioContext | null>(null);

  function playReadyCue() {
    if ("vibrate" in navigator) navigator.vibrate([180, 80, 180]);
    const context = soundContext.current;
    if (!context) return;
    void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(700, context.currentTime);
    oscillator.frequency.setValueAtTime(950, context.currentTime + 0.16);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.38);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.4);
  }

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(`/api/orders/${encodeURIComponent(token)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 404 ? "We could not find this order." : "Could not refresh this order.");
      const result = await response.json() as { order: Order };
      const next = result.order as Order;
      if (next.status === "ready" && previousStatus.current && previousStatus.current !== "ready" && previousStatus.current !== "collected" && previousStatus.current !== "cancelled") {
        if (alertEnabledRef.current) playReadyCue();
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          new Notification("Your food is ready", { body: `Kawan, Makan Lah! Order #${next.number} is ready for pickup.`, icon: "/favicon.svg" });
        }
      }
      previousStatus.current = next.status;
      setOrder(next);
      setError("");
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not refresh this order.");
    }
  }, [token]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 6000);
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); void soundContext.current?.close(); };
  }, [refresh]);

  async function enableAlert() {
    if (typeof window.AudioContext !== "undefined") {
      soundContext.current = new window.AudioContext();
      await soundContext.current.resume();
    }
    alertEnabledRef.current = true;
    setAlertEnabled(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* sound and vibration remain available */ }
    }
  }

  async function copyLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setCopyError("");
      window.setTimeout(() => setCopied(false), 2500);
    } catch { setCopyError("Copy is unavailable here. Share this page address from your browser."); }
  }

  const currentStep = order ? steps.findIndex((step) => step.key === order.status) : 0;
  return <main className="status-page">
    <header className="status-header"><Link href="/">Kawan, Makan Lah!</Link></header>
    <div className="status-container">
      {!order && !error && <p className="status-loading" role="status">Loading your order…</p>}
      {!order && error && <div className="status-failure" role="alert"><h1>Order unavailable</h1><p>{error}</p><button onClick={() => void refresh()}>Try again</button></div>}
      {order && <>
        <div className={`pickup-ticket ${order.status === "ready" ? "ticket-ready" : ""}`}>
          <span className="ticket-label">Your pickup number</span>
          <strong>#{order.number}</strong>
          <p>{order.status === "ready" ? "Ready for pickup" : order.status === "collected" ? "Collected. Thank you!" : order.status === "cancelled" ? "Order cancelled" : "We have your order"}</p>
        </div>
        <section className="status-section" aria-labelledby="status-heading">
          <div className="status-section-head"><h1 id="status-heading">Order status</h1><span>Updates automatically</span></div>
          {order.status === "cancelled" ? <p className="cancelled-message">This order was cancelled. Please speak to the stall to place a new order.</p> : <ol className="status-steps">{steps.map((step, index) => <li key={step.key} className={index < currentStep ? "is-done" : index === currentStep ? "is-current" : ""}>
            <span className="step-mark" aria-hidden="true">{index + 1}</span>
            <span>{step.label}</span>
          </li>)}</ol>}
          {order.status === "ready" && <p className="ready-message">Please show pickup number #{order.number} at the stall and pay when you collect.</p>}
          {order.status !== "ready" && order.status !== "collected" && order.status !== "cancelled" && <p className="status-help">Keep this page open to see when your food is ready. You can also come back to this link later.</p>}
          {!alertEnabled && order.status !== "collected" && order.status !== "ready" && order.status !== "cancelled" && <button className="alert-button" onClick={() => void enableAlert()}>Alert me while this page is open</button>}
          {alertEnabled && order.status !== "collected" && order.status !== "ready" && order.status !== "cancelled" && <p className="alert-enabled">Sound and vibration are on while this page is open.</p>}
        </section>
        <section className="status-section" aria-labelledby="summary-heading">
          <div className="status-section-head"><h2 id="summary-heading">{order.status === "cancelled" ? "Cancelled order" : "Your order"}</h2><span>{order.status === "cancelled" ? "No payment due" : "Pay at stall"}</span></div>
          <div className="status-lines">{order.lines.map((line, index) => <div key={`${line.name}-${index}`}><span>{line.quantity} × {line.name}</span><strong>{won(line.quantity * line.price)}</strong></div>)}</div>
          <div className="status-total"><span>{order.status === "cancelled" ? "Original total" : "Total"}</span><strong>{order.status === "cancelled" ? <s>{won(order.total)}</s> : won(order.total)}</strong></div>
          {order.note && <p className="status-note"><span>Note:</span> {order.note}</p>}
        </section>
        {error && <p className="stale-warning" role="status">Connection interrupted. Showing the last update. <button onClick={() => void refresh()}>Refresh</button></p>}
        <div className="status-actions"><button onClick={() => void copyLink()}>{copied ? "Link copied" : "Copy order link"}</button><Link href="/">Back to menu</Link></div>
        {copyError && <p className="copy-error" role="status">{copyError}</p>}
      </>}
    </div>
  </main>;
}
