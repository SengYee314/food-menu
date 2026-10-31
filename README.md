# Kawan, Makan Lah!

A phone-first ordering site for a one-day food stall. Customers order as guests, receive a pickup number, pay at the stall, and follow a live status page. Sellers use `/seller` to move orders through Received, Preparing, Ready, and Collected, cancel an uncollected order, adjust portions, and pause new orders. `/seller/sales` shows order counts, portions, item totals, and the grand total for the current stock session. Payment is not tracked, so these are order values.

## Menu and stock

The five confirmed items are seeded once into D1. Current stock survives server restarts and does not reset at midnight. Sold-out items stay visible and cannot be ordered. The seller can adjust portions or mark an item sold out. Cancelling an uncollected order returns its reserved portions to stock and removes its value from sales. Collected orders cannot be cancelled. In the seller Stock tab, **Reset stock** cancels open orders, restores starting portions, makes every item available, and starts a new sales count at zero. Older orders remain saved but are hidden from the new seller session; their pickup links still show their final status. Pickup numbers continue increasing so old and new links stay distinct.

## Local development

Install the locked dependencies, build once to generate the local Wrangler configuration, and apply the migration:

```sh
npm ci
npm run build
for migration in drizzle/000[0-9]_*.sql; do
  node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file "$migration"
done
npm run dev
```

Apply each migration only once. Existing local databases need only the new migration files. Migrations `0002`, `0003`, and `0004` have already been applied to this workspace's local database.

The local Sites preview provides a development seller login at `/signin-with-chatgpt?return_to=/seller`. Hosted seller access is allowed only for the Site owner and emails configured in the `SELLER_EMAILS` runtime binding. Set that binding when the second seller email is provided. Every seller API route checks authorization on the server.

Run the stock reservation tests with `python3 -m unittest discover -s tests -v`.

## Ready alerts

The order page updates every few seconds. Customers can enable sound and vibration while it stays open, plus a browser notification when supported and permitted. Closed-phone alerts are not active. No phone number is collected and no SMS is sent. SMS would require a paid provider and a registered sender number; iPhone web push would require the customer to add the site to the Home Screen and opt in.

The QR code should be generated only after the final public URL and ordering flow are verified.

## Hosted access

The existing Site was replaced and renamed to `https://kawan-makan-lah.snu-chatgpt-5678.chatgpt.site`. This SNU workspace currently has public Sites publishing disabled, so the Site remains owner-only. A workspace administrator must enable public publishing, or the app must move to another public Worker/D1 host before customers can use a QR code.
