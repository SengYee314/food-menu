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
            database.execute("INSERT INTO orders(token, idempotency_key, request_fingerprint, note, total, status, created_at, updated_at) VALUES(?, ?, 'same', '', 4000, 'received', 'now', 'now')", (token, key))
            database.execute("INSERT INTO order_lines(order_id, menu_item_id, name, quantity, price) SELECT id, 'indomie', 'Indomie', 1, 4000 FROM orders WHERE token = ?", (token,))
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


if __name__ == "__main__":
    unittest.main()
