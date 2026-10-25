import { ApiError } from "./http";
import type { MenuItem } from "./stall";

export type OrderStatus = "received" | "preparing" | "ready" | "collected";
export type OrderLine = { name: string; quantity: number; price: number; menuItemId: string };
export type Order = {
  id: number;
  number: number;
  token: string;
  status: OrderStatus;
  note: string;
  total: number;
  createdAt: string;
  updatedAt: string;
  preparingAt: string | null;
  readyAt: string | null;
  collectedAt: string | null;
  lines: OrderLine[];
};

type OrderRow = {
  id: number;
  token: string;
  status: OrderStatus;
  note: string;
  total: number;
  created_at: string;
  updated_at: string;
  preparing_at: string | null;
  ready_at: string | null;
  collected_at: string | null;
  request_fingerprint?: string;
};

type LineRow = {
  order_id: number;
  menu_item_id: string;
  name: string;
  quantity: number;
  price: number;
};

const orderColumns = "id, token, status, note, total, created_at, updated_at, preparing_at, ready_at, collected_at, request_fingerprint";

export function formatOrder(row: OrderRow, lines: LineRow[]): Order {
  return {
    id: row.id,
    number: row.id,
    token: row.token,
    status: row.status,
    note: row.note,
    total: row.total,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    preparingAt: row.preparing_at,
    readyAt: row.ready_at,
    collectedAt: row.collected_at,
    lines: lines.filter((line) => line.order_id === row.id).map((line) => ({
      name: line.name,
      quantity: line.quantity,
      price: line.price,
      menuItemId: line.menu_item_id,
    })),
  };
}

export async function orderByToken(db: D1Database, token: string): Promise<Order | null> {
  const row = await db.prepare(`SELECT ${orderColumns} FROM orders WHERE token = ?`).bind(token).first<OrderRow>();
  if (!row) return null;
  const lines = await db.prepare("SELECT order_id, menu_item_id, name, quantity, price FROM order_lines WHERE order_id = ? ORDER BY id").bind(row.id).all<LineRow>();
  return formatOrder(row, lines.results);
}

export async function orderByIdempotency(db: D1Database, key: string): Promise<{ order: Order; fingerprint: string } | null> {
  const row = await db.prepare(`SELECT ${orderColumns} FROM orders WHERE idempotency_key = ?`).bind(key).first<OrderRow>();
  if (!row) return null;
  const lines = await db.prepare("SELECT order_id, menu_item_id, name, quantity, price FROM order_lines WHERE order_id = ? ORDER BY id").bind(row.id).all<LineRow>();
  return { order: formatOrder(row, lines.results), fingerprint: row.request_fingerprint ?? "" };
}

export async function listOrders(db: D1Database): Promise<Order[]> {
  const [active, collected] = await db.batch([
    db.prepare(`SELECT ${orderColumns} FROM orders WHERE status != 'collected' ORDER BY CASE status WHEN 'received' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END, id ASC`),
    db.prepare(`SELECT ${orderColumns} FROM orders WHERE status = 'collected' ORDER BY id DESC LIMIT 50`),
  ]);
  const rows = [...active.results, ...collected.results] as unknown as OrderRow[];
  if (!rows.length) return [];
  const placeholders = rows.map(() => "?").join(",");
  const lines = await db.prepare(`SELECT order_id, menu_item_id, name, quantity, price FROM order_lines WHERE order_id IN (${placeholders}) ORDER BY id`)
    .bind(...rows.map((row) => row.id)).all<LineRow>();
  return rows.map((row) => formatOrder(row, lines.results));
}

export async function requestFingerprint(items: Array<{ id: string; quantity: number }>, note: string): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify({ items: [...items].sort((a, b) => a.id.localeCompare(b.id)), note }));
  const bytes = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function parseOrderItems(value: unknown): Array<{ id: string; quantity: number }> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 5) {
    throw new ApiError("INVALID_ORDER", "Choose at least one menu item.", 400);
  }
  const seen = new Set<string>();
  let totalQuantity = 0;
  const items = value.map((input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError("INVALID_ORDER", "Check your order quantities.", 400);
    const id = (input as Record<string, unknown>).id;
    const quantity = (input as Record<string, unknown>).quantity;
    if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id) || !Number.isInteger(quantity) || (quantity as number) < 1 || (quantity as number) > 8 || seen.has(id)) {
      throw new ApiError("INVALID_ORDER", "Check your order quantities.", 400);
    }
    seen.add(id);
    totalQuantity += quantity as number;
    return { id, quantity: quantity as number };
  });
  if (totalQuantity > 8) throw new ApiError("INVALID_ORDER", "Please order 8 portions or fewer at once.", 400);
  return items;
}

export function checkStock(items: Array<{ id: string; quantity: number }>, menu: MenuItem[]): void {
  for (const line of items) {
    const item = menu.find((entry) => entry.id === line.id);
    if (!item) throw new ApiError("INVALID_ITEM", "A menu item is unavailable.", 400, { itemId: line.id });
    if (!item.available || item.remaining < line.quantity) {
      throw new ApiError("OUT_OF_STOCK", `${item.name} has fewer portions left.`, 409, { itemId: line.id, remaining: item.available ? item.remaining : 0 });
    }
  }
}
