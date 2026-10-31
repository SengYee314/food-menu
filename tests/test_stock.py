"""Run with `python3 -m unittest discover -s tests`.

These tests exercise the same SQLite migration D1 applies in production.
"""

import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path


MIGRATIONS = sorted((Path(__file__).parents[1] / "drizzle").glob("[0-9][0-9][0-9][0-9]_*.sql"))


def connect(path):
    connection = sqlite3.connect(path, timeout=5)
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


class StockReservationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "orders.sqlite"
        with connect(self.path) as database:
            for migration in MIGRATIONS:
                for statement in migration.read_text().split("--> statement-breakpoint"):
                    if statement.strip():
                        database.executescript(statement)
            database.execute("INSERT INTO stall_settings(id, paused) VALUES(1, 0)")
            database.execute("INSERT INTO menu_items(id, name, description, category, image, price, opening_stock, remaining, available) VALUES('indomie', 'Indomie', '', 'Food', '', 4000, 1, 1, 1)")

    def tearDown(self):
        self.temp.cleanup()

    def place(self, token, key, rate_key=None):
        with connect(self.path) as database:
            database.execute("BEGIN IMMEDIATE")
            database.execute("INSERT INTO orders(token, idempotency_key, request_fingerprint, note, total, status, created_at, updated_at, session_id) SELECT ?, ?, 'same', '', 4000, 'received', 'now', 'now', session_id FROM stall_settings WHERE id=1", (token, key))
            database.execute("INSERT INTO order_lines(order_id, menu_item_id, name, quantity, reserved_quantity, price) SELECT id, 'indomie', 'Indomie', 1, 1, 4000 FROM orders WHERE token = ?", (token,))
            if rate_key:
                database.execute("INSERT INTO order_rate_limits(key, attempts) VALUES(?, 1) ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1", (rate_key,))

    def test_two_buyers_cannot_take_the_last_portion(self):
        barrier = threading.Barrier(3)
        outcomes = []

        def buy(number):
            barrier.wait()
            try:
                self.place(str(number), f"key-{number}")
                outcomes.append("placed")
            except sqlite3.IntegrityError:
                outcomes.append("sold-out")

        threads = [threading.Thread(target=buy, args=(number,)) for number in (1, 2)]
        for thread in threads: thread.start()
        barrier.wait()
        for thread in threads: thread.join()
        self.assertCountEqual(outcomes, ["placed", "sold-out"])
        with connect(self.path) as database:
            self.assertEqual(database.execute("SELECT remaining FROM menu_items WHERE id='indomie'").fetchone()[0], 0)
            self.assertEqual(database.execute("SELECT count(*) FROM orders").fetchone()[0], 1)

    def test_duplicate_submission_does_not_take_stock_twice(self):
        self.place("first", "retry-key")
        with self.assertRaises(sqlite3.IntegrityError):
            self.place("second", "retry-key")
        with connect(self.path) as database:
            self.assertEqual(database.execute("SELECT remaining FROM menu_items WHERE id='indomie'").fetchone()[0], 0)
            self.assertEqual(database.execute("SELECT count(*) FROM orders").fetchone()[0], 1)

    def test_pause_blocks_new_orders(self):
        with connect(self.path) as database:
            database.execute("UPDATE stall_settings SET paused=1 WHERE id=1")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "ORDERS_PAUSED"):
            self.place("paused", "paused-key")

    def test_fifth_order_from_same_ip_rolls_back_stock(self):
        with connect(self.path) as database:
            database.execute("UPDATE menu_items SET remaining=10 WHERE id='indomie'")
        for number in range(4):
            self.place(str(number), f"key-{number}", "ip-window")
        with self.assertRaisesRegex(sqlite3.IntegrityError, "order_rate_limit_4"):
            self.place("fifth", "fifth-key", "ip-window")
        with connect(self.path) as database:
            self.assertEqual(database.execute("SELECT remaining FROM menu_items WHERE id='indomie'").fetchone()[0], 6)
            self.assertEqual(database.execute("SELECT count(*) FROM orders").fetchone()[0], 4)

    def test_cancel_returns_reserved_portions_and_excludes_sale(self):
        with connect(self.path) as database:
            database.execute("UPDATE menu_items SET opening_stock=3, remaining=3 WHERE id='indomie'")
        self.place("first", "first-key")
        with connect(self.path) as database:
            database.execute("UPDATE orders SET status='cancelled', version=version+1 WHERE token='first'")
            database.execute("UPDATE order_lines SET reserved_quantity=0 WHERE order_id=(SELECT id FROM orders WHERE token='first')")
            self.assertEqual(database.execute("SELECT remaining FROM menu_items WHERE id='indomie'").fetchone()[0], 3)
            self.assertEqual(database.execute("SELECT COUNT(*), COALESCE(SUM(total),0) FROM orders WHERE session_id=1 AND status != 'cancelled'").fetchone(), (0, 0))

    def test_reset_cancels_open_orders_without_double_stock(self):
        self.place("first", "first-key")
        with connect(self.path) as database:
            database.execute("UPDATE orders SET status='cancelled', version=version+1 WHERE session_id=(SELECT session_id FROM stall_settings WHERE id=1) AND status IN ('received','preparing','ready')")
            database.execute("UPDATE order_lines SET reserved_quantity=0")
            database.execute("UPDATE menu_items SET remaining=opening_stock, available=1")
            database.execute("UPDATE stall_settings SET session_id=session_id+1 WHERE id=1")
            self.assertEqual(database.execute("SELECT remaining FROM menu_items WHERE id='indomie'").fetchone()[0], 1)
            self.assertEqual(database.execute("SELECT status FROM orders WHERE token='first'").fetchone()[0], "cancelled")
            self.assertEqual(database.execute("SELECT COUNT(*), COALESCE(SUM(total),0) FROM orders WHERE session_id=2 AND status != 'cancelled'").fetchone(), (0, 0))

    def test_new_session_sales_start_at_zero_then_count_new_orders(self):
        self.place("first", "first-key")
        with connect(self.path) as database:
            database.execute("UPDATE orders SET status='cancelled', version=version+1 WHERE session_id=(SELECT session_id FROM stall_settings WHERE id=1) AND status IN ('received','preparing','ready')")
            database.execute("UPDATE order_lines SET reserved_quantity=0")
            database.execute("UPDATE menu_items SET remaining=opening_stock, available=1")
            database.execute("UPDATE stall_settings SET session_id=session_id+1 WHERE id=1")
            self.assertEqual(database.execute("SELECT COUNT(*), COALESCE(SUM(total),0) FROM orders WHERE session_id=2 AND status != 'cancelled'").fetchone(), (0, 0))
        self.place("second", "second-key")
        with connect(self.path) as database:
            self.assertEqual(database.execute("SELECT COUNT(*), COALESCE(SUM(total),0) FROM orders WHERE session_id=2 AND status != 'cancelled'").fetchone(), (1, 4000))
            self.assertEqual(database.execute("SELECT COUNT(*) FROM orders WHERE session_id=1").fetchone()[0], 1)

    def test_reset_keeps_collected_orders_in_history(self):
        self.place("first", "first-key")
        with connect(self.path) as database:
            database.execute("UPDATE orders SET status='collected' WHERE token='first'")
            database.execute("UPDATE orders SET status='cancelled' WHERE session_id=(SELECT session_id FROM stall_settings WHERE id=1) AND status IN ('received','preparing','ready')")
            database.execute("UPDATE order_lines SET reserved_quantity=0")
            database.execute("UPDATE menu_items SET remaining=opening_stock, available=1")
            database.execute("UPDATE stall_settings SET session_id=session_id+1 WHERE id=1")
            self.assertEqual(database.execute("SELECT status FROM orders WHERE token='first'").fetchone()[0], "collected")
            self.assertEqual(database.execute("SELECT COUNT(*) FROM orders WHERE session_id=2").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
