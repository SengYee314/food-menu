import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const menuItems = sqliteTable("menu_items", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  image: text("image").notNull(),
  price: integer("price").notNull(),
  openingStock: integer("opening_stock").notNull(),
  remaining: integer("remaining").notNull(),
  available: integer("available", { mode: "boolean" }).notNull().default(true),
});

export const stallSettings = sqliteTable("stall_settings", {
  id: integer("id").primaryKey(),
  paused: integer("paused", { mode: "boolean" }).notNull().default(false),
});

export const orders = sqliteTable("orders", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  token: text("token").notNull().unique(),
  idempotencyKey: text("idempotency_key").notNull().unique(),
  requestFingerprint: text("request_fingerprint").notNull(),
  note: text("note").notNull().default(""),
  total: integer("total").notNull(),
  status: text("status").notNull().default("received"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  preparingAt: text("preparing_at"),
  readyAt: text("ready_at"),
  collectedAt: text("collected_at"),
});

export const orderLines = sqliteTable("order_lines", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  orderId: integer("order_id").notNull().references(() => orders.id),
  menuItemId: text("menu_item_id").notNull().references(() => menuItems.id),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  price: integer("price").notNull(),
});

export const orderRateLimits = sqliteTable("order_rate_limits", {
  key: text("key").primaryKey(),
  attempts: integer("attempts").notNull(),
}, (table) => [check("order_rate_limit_4", sql`${table.attempts} <= 4`)]);
