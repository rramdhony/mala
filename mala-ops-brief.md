# Mala — Operations System Brief
*For Claude Code. Full build specification.*
*Last updated: June 2026*

---

## Context

The Mala website is live at `mala-spices.ruben-ramdhony.workers.dev`, built on Cloudflare Workers. It accepts pre-orders via a form and routes customers to WhatsApp. The site is complete and should not be modified except to wire up the form webhook described below.

What needs to be built is everything behind it: the operations system Jessy uses on her phone to run the business, and the admin dashboard Ruben uses to manage it.

**Do not touch the existing website Worker. Build a new, separate Worker for the ops API.**

---

## The Business

**Mala** is a small-batch artisanal spice brand from Mauritius. Three products, two formats.

| Product | Format | Price |
|---|---|---|
| Masala Pimenté | 250g pouch | Rs 250 |
| Masala Sans Piment | 250g pouch | Rs 250 |
| Épices Briani | 250g pouch | Rs 250 |
| Le Trio (3 pouches) | Bundle | Rs 695 |
| Coffret Signature | 3 × 40g tins | Rs 750 |
| Coffret Personnalisé | 3 × 40g tins, custom | Rs 950+ |
| Wholesale (loose pouches) | Min 30 packets | Rs 80/packet |

**Delivery charges:**
- Central & Plaines Wilhems: Rs 100 (free over Rs 1,000)
- North & West Coast: Rs 200 (free over Rs 2,500)
- South & East: Rs 250 (free over Rs 2,500)

**Payment:** Cash on delivery, MCB Juice, bank transfer. No upfront payment.

**Two users:**
- **Jessy** — producer, does deliveries, records sales on the go
- **Ruben** — admin, manages orders, tracks finances, plans routes

---

## Stack

```
Frontend:    React + Vite → Cloudflare Pages
Backend:     Cloudflare Workers (new Worker, separate from website)
Database:    Cloudflare D1 (SQLite)
Sessions:    Cloudflare KV
Auth:        PIN-based (2 users only, no registration)
Fonts:       Cormorant Garamond + DM Sans (Google Fonts)
```

---

## Brand Design Tokens

Every UI element must use these exactly. Match the packaging aesthetic.

```css
--green:         #1B4332   /* primary — hero, sidebar, product cards */
--green-mid:     #2D6A4F   /* hover states */
--gold:          #C9922A   /* accent — CTAs, prices, dividers */
--gold-light:    #E8B84B   /* hover on gold */
--amber:         #C8841A   /* Masala Sans Piment colour */
--burgundy:      #6B1E2E   /* Briani colour */
--cream:         #F5ECD7   /* light background, text on dark */
--cream-dark:    #EAD9BC   /* alternating sections */
--ink:           #1A0E04   /* body text on light */
--ink-mid:       #3D2B15   /* secondary text on light */
```

**Typography:**
- Display / titles: `Cormorant Garamond`, italic, weight 300–600
- Body / labels / UI: `DM Sans`, weight 300–500
- Prices and large numbers: `Cormorant Garamond`, gold colour
- Section eyebrows: `DM Sans` 10px, weight 500, uppercase, letter-spacing 0.25em

---

## Project Structure

```
mala-ops/
├── worker/                  Cloudflare Worker — API
│   ├── src/
│   │   ├── index.js         Main entry, routes
│   │   ├── routes/
│   │   │   ├── orders.js
│   │   │   ├── batches.js
│   │   │   ├── expenses.js
│   │   │   ├── sales.js
│   │   │   ├── customers.js
│   │   │   ├── stock.js
│   │   │   ├── dashboard.js
│   │   │   └── webhook.js
│   │   └── middleware/
│   │       └── auth.js
│   ├── db/
│   │   ├── schema.sql
│   │   └── seed.sql
│   └── wrangler.toml
│
└── app/                     React PWA — Cloudflare Pages
    ├── src/
    │   ├── pages/
    │   │   ├── jessy/       Jessy's mobile interface
    │   │   │   ├── Sale.jsx
    │   │   │   ├── Deliveries.jsx
    │   │   │   ├── NewBatch.jsx
    │   │   │   └── Stock.jsx
    │   │   └── admin/       Admin dashboard
    │   │       ├── Dashboard.jsx
    │   │       ├── Orders.jsx
    │   │       ├── Customers.jsx
    │   │       ├── Batches.jsx
    │   │       ├── Expenses.jsx
    │   │       ├── Stock.jsx
    │   │       └── Reports.jsx
    │   ├── components/      Shared UI
    │   ├── api/             Worker fetch wrappers
    │   └── store/           Local state + offline queue
    ├── public/
    │   ├── manifest.json    PWA manifest
    │   └── sw.js            Service worker
    └── vite.config.js
```

---

## Database Schema

```sql
-- Capital equipment (one-off purchases, not deducted from margin)
CREATE TABLE capital (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  item TEXT NOT NULL,
  cost REAL NOT NULL,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Ingredient and consumable purchases
CREATE TABLE expenses (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  category TEXT NOT NULL,      -- 'ingredients' | 'packaging' | 'consumables' | 'other'
  description TEXT NOT NULL,
  supplier TEXT,
  cost REAL NOT NULL,
  batch_id TEXT,               -- optional link to batch
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Production batches
CREATE TABLE batches (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  label TEXT NOT NULL,
  product TEXT NOT NULL,       -- 'masala_pimente' | 'masala_sans_piment' | 'briani'
  ingredient_cost REAL NOT NULL,
  grinds INTEGER DEFAULT 0,
  packets_produced INTEGER DEFAULT 0,
  hours_taken REAL DEFAULT 0,
  notes TEXT,
  pending INTEGER DEFAULT 1,   -- 1 = grinding not yet confirmed
  created_at TEXT DEFAULT (datetime('now'))
);

-- Customers
CREATE TABLE customers (
  id TEXT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT NOT NULL UNIQUE,
  email TEXT,
  zone TEXT,
  address TEXT,
  latitude REAL,
  longitude REAL,
  what3words TEXT,
  type TEXT DEFAULT 'retail',  -- 'retail' | 'wholesale' | 'corporate'
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Orders (website form + manual entry + WhatsApp)
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  source TEXT DEFAULT 'manual', -- 'website' | 'whatsapp' | 'manual' | 'walkin'
  date TEXT NOT NULL,
  customer_id TEXT,
  customer_name TEXT,           -- for orders without a customer profile yet
  customer_phone TEXT,
  customer_email TEXT,
  delivery_zone TEXT,
  delivery_address TEXT,
  personalisation_note TEXT,
  status TEXT DEFAULT 'pending', -- 'pending' | 'confirmed' | 'produced' | 'delivered' | 'cancelled'
  payment_method TEXT,           -- 'cash' | 'juice' | 'bank_transfer'
  payment_status TEXT DEFAULT 'unpaid',
  delivery_date TEXT,
  delivery_charge REAL DEFAULT 0,
  notes TEXT,
  total REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (customer_id) REFERENCES customers(id)
);

-- Order line items
CREATE TABLE order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product TEXT NOT NULL,
  format TEXT NOT NULL,        -- '250g_pouch' | '40g_tin' | 'coffret_3' | 'trio_pouch'
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Sales (completed transactions)
CREATE TABLE sales (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  order_id TEXT,               -- optional link to order
  customer_id TEXT,
  sale_type TEXT DEFAULT 'retail', -- 'retail' | 'wholesale' | 'walkin'
  product TEXT NOT NULL,
  format TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price REAL NOT NULL,
  total REAL NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  batch_id TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Stock adjustments log
CREATE TABLE stock_adjustments (
  id TEXT PRIMARY KEY,
  date TEXT NOT NULL,
  product TEXT NOT NULL,
  adjustment INTEGER NOT NULL, -- positive = added, negative = removed
  reason TEXT,                 -- 'batch_complete' | 'sale' | 'waste' | 'correction'
  reference_id TEXT,           -- batch_id or sale_id
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
```

---

## Seed Data

Run on first deploy via `wrangler d1 execute`.

```sql
-- Capital equipment already purchased
INSERT INTO capital VALUES
  ('c1', '2026-05-25', 'Spice Grinder', 13000, 'Initial equipment purchase', datetime('now')),
  ('c2', '2026-05-25', 'Bag Sealer', 0, 'Confirm cost and update', datetime('now'));

-- Current batch — pending grinding confirmation
INSERT INTO batches VALUES
  ('b1', '2026-05-25', 'Batch 1 — May 2026', 'masala_pimente',
   7095, 0, 0, 0, 'Spices purchased. Confirm after grinding.', 1, datetime('now'));

-- Trial month — historical reference only
INSERT INTO batches VALUES
  ('b0', '2026-04-01', 'Trial — April 2026', 'masala_pimente',
   6000, 69, 138, 0, 'Trial batch. Manually entered.', 0, datetime('now'));
```

---

## Worker API Endpoints

```
Auth
POST   /api/auth/login          Validate PIN, return session token

Orders
POST   /api/orders              Create order (manual or from webhook)
GET    /api/orders              List orders — filters: status, date, zone, source
GET    /api/orders/pending      Unconfirmed orders — Jessy's delivery queue
GET    /api/orders/:id          Single order with line items
PATCH  /api/orders/:id          Update status, payment, delivery date

Batches
POST   /api/batches             Create batch
GET    /api/batches             List batches
PATCH  /api/batches/:id         Update (confirm grinding results)

Expenses
POST   /api/expenses            Log expense or capital item
GET    /api/expenses            List — filters: category, date range

Sales
POST   /api/sales               Record a sale
GET    /api/sales               List — filters: date, product, type

Customers
GET    /api/customers           List with search
POST   /api/customers           Create customer
GET    /api/customers/:id       Customer profile + order history
PATCH  /api/customers/:id       Update (GPS pin, notes, type)

Stock
GET    /api/stock               Current stock levels per product
POST   /api/stock/adjust        Manual adjustment with reason

Dashboard
GET    /api/dashboard           Aggregated: stock, revenue, profit, pending orders

Webhook
POST   /api/webhook/website     Receives form submissions from the Mala website
```

---

## Authentication

Two users only. No registration.

```javascript
// In Worker environment variables (wrangler.toml secrets)
JESSY_PIN = "XXXX"   // 4 digits
ADMIN_PIN = "XXXXXX" // 6 digits

// Jessy PIN → access /jessy only
// Admin PIN → access /admin and /jessy
```

Session stored in Cloudflare KV with 12-hour TTL. On first load show a full-screen PIN entry with the Mala wordmark in Cormorant Garamond italic. No username field, just a PIN pad.

---

## Interface A — Jessy's Mobile PWA

### Design Rules
- Green `#1B4332` background throughout
- Gold `#C9922A` as sole accent colour
- Cormorant Garamond italic for screen titles only
- DM Sans for all inputs, labels, values
- Minimum tap target: 48px on all interactive elements
- No tables, no horizontal scroll, no dense layouts
- Large numbers, high contrast, readable in sunlight
- Bottom tab bar always visible: 4 tabs

---

### Tab 1 — Vente (Quick Sale)

**Product grid:** 2×3 grid of tappable product tiles. Each tile shows French product name, format, and price. Tapping selects it and highlights gold border. Multiple products can be selected for a single transaction.

**Quantity control:** Below the grid. Minus / number / plus. Minimum 1.

**Sale type toggle:** Détail (Rs 250/pouch) or Gros (Rs 80/pouch, minimum 30 packets). Switching to Gros recalculates total and shows minimum warning.

**Running total:** Updates live as products and quantities change.

**Customer field:** Optional. Type name or phone to search existing customers. Autocomplete from the customers table. If no match: "Ajouter comme nouveau client" or "Vente sans client" (walk-in).

**GPS capture:** If a known customer is selected and they have no GPS pin saved, a button appears: "📍 Enregistrer la position actuelle". One tap saves current coordinates to their profile. Does not appear for walk-ins.

**Enregistrer button:** Full-width, gold. On tap:
1. Saves to `sales` table
2. Creates stock adjustment (negative)
3. If linked to an order, updates order status to `delivered` and `paid`
4. Brief success animation
5. Resets form

---

### Tab 2 — Livraisons (Today's Deliveries)

**Header:** Today's date. Summary: "X commandes · Y paquets · Rs Z à encaisser"

**Order cards:** One card per confirmed order, grouped by delivery zone. Each card shows:
- Customer name and zone
- Order summary (product + quantity)
- Total due
- Personalisation note if present (highlighted in gold)
- One button: "✓ Livré et payé"

Tapping the button marks the order as delivered and paid, turns the card green with a timestamp. Cannot be undone from Jessy's interface (admin can correct).

**Map button:** "Voir l'itinéraire" — opens Google Maps with all pending delivery pins loaded as waypoints. Uses `https://www.google.com/maps/dir/` with coordinates from customer profiles.

**Running total:** "Encaissé aujourd'hui: Rs X" updates as deliveries are confirmed.

---

### Tab 3 — Nouveau Lot (New Batch)

**Form fields:**
- Product (selector: Masala Pimenté / Sans Piment / Briani)
- Date (defaults to today)
- Coût ingrédients (Rs) — numeric
- Nombre de broyages — numeric
- Paquets produits — numeric
- Temps de production (hours) — numeric with 0.5 step
- Notes — text

**Live calculation box** (appears as fields are filled):
- Coût par paquet: Rs X
- Marge si vendu Rs 250: Rs Y (Z%)
- Marge si vente gros Rs 80: Rs Y (Z%)

If grinding is not yet done, submit as pending — grinding fields can be completed later. Pending batches show a banner on the Stock tab.

---

### Tab 4 — Mon Stock

**Stock cards:** One per product. Large number in Cormorant Garamond showing packets in hand. Below: value at retail price.

**This month summary:** Four small tiles — Produits, Vendus, Revenu, Bénéfice.

**Pending batch alert:** If any batch is marked pending, a gold banner shows: "Lot en attente — confirmer les résultats du broyage." Tapping opens Tab 3 with that batch pre-loaded.

**Low stock alert:** Red-tinted card if any product below 20 packets.

**Shortcut:** "Créer un nouveau lot" button links to Tab 3.

---

## Interface B — Admin Dashboard

### Design Rules
- Cream `#F5ECD7` main background — data environment, not sales
- Green sidebar and top header
- Gold for KPI values and accent elements
- Cormorant Garamond for large metric numbers
- DM Sans for all labels, table text, filters
- Tables: generous row height (52px), clear alternating rows
- Sticky sidebar on desktop, bottom nav on mobile

---

### Dashboard Page

**KPI row (4 cards):**
- Packets in stock (total, all products)
- Revenue this month (Rs)
- Gross profit this month (Rs + margin %)
- Orders pending confirmation (count, links to Orders page)

**Charts row:**
- Bar chart: Revenue vs Ingredient Cost per month, last 6 months
- Horizontal bar: Stock level per product (packets in hand vs produced this month)

**Live feeds row:**
- Recent orders (last 5): customer name, products, total, status badge
- Pending batches needing grinding confirmation

---

### Orders Page

**Table columns:** Date · Customer · Products · Total · Zone · Status · Payment · Source

**Status badges:** pending (amber) · confirmed (blue) · produced (purple) · delivered (green) · cancelled (red)

**Filters:** Status, date range (from/to), delivery zone, source (website/whatsapp/manual/walkin)

**Row actions:**
- Click status badge to update status inline
- Click row to expand full order detail including personalisation note
- Assign delivery date from a date picker

**Bulk actions:** Select multiple orders → assign delivery date, export selected as CSV or PDF

**New Order button:** Full form modal. All fields from the website form plus: link to existing customer, source selector, internal notes.

---

### Customers Page

**Table columns:** Name · Phone · Zone · Type · Total Orders · Total Spent · Last Order

**Search:** Live search by name or phone.

**Customer profile (click row):**
- All orders in a sub-table
- GPS pin on a small embedded Google Map (uses Maps Embed API or a static map image)
- Edit form: update type, zone, notes, GPS coordinates
- "Ajouter une note" quick field

**Export:** Customer list as CSV (name, phone, zone, total spent)

---

### Batches Page

**Table columns:** Date · Product · Ingredient Cost · Grinds · Packets · Cost/Packet · Margin

**Pending batches** shown at top with a yellow highlight and a "Confirmer" button that opens an inline edit form.

**Summary row at top:**
- Total produced this month
- Average cost per packet (all products)
- Average gross margin

---

### Expenses Page

**Table columns:** Date · Category · Description · Supplier · Cost · Linked Batch

**Category filter:** Ingrédients · Emballage · Consommables · Équipement · Autre

**Summary cards:**
- Ingrédients total (this month and all time)
- Emballage total
- Autre total

**Capital section** (separate from operating expenses):
- List of capital items (grinder, sealer etc)
- Total capital invested
- Note: not deducted from gross margin

**Add Expense button:** Quick form modal. Category, description, supplier, cost, date, optional batch link.

---

### Stock Page

**Current stock:** Large card per product. Packets in hand. Value at retail. Value at wholesale.

**Stock movement log:** Chronological table of every addition (batch) and reduction (sale or adjustment). Columns: date, product, change (+/-), reason, reference.

**Manual adjustment:** Button opens a form. Product, quantity (positive or negative), reason dropdown (Gaspillage / Correction / Échantillon), notes.

---

### Reports Page

**Monthly P&L Report:**

```
MALA — Rapport Mensuel
[Month Year]

REVENUS
  Ventes détail        Rs X
  Ventes gros          Rs X
  Coffrets cadeaux     Rs X
  Total revenus        Rs X

COÛTS
  Ingrédients          Rs X
  Emballage            Rs X
  Livraisons           Rs X
  Total coûts          Rs X

B�NÉFICE BRUT         Rs X  (X%)

INVESTISSEMENT CAPITAL (cumulé)
  Équipements          Rs X

PRODUCTION
  Paquets produits     X
  Paquets vendus       X
  Paquets en stock     X
```

Export as PDF button — clean enough to attach to a DBM loan application or SMEDA grant form.

**Customer Analysis Report:**
- Top 10 customers by spend
- Retail vs wholesale revenue split
- Orders by delivery zone (pie or bar)

---

## Website Webhook Integration

The existing website at `mala-spices.ruben-ramdhony.workers.dev` has a pre-order form. Modify **only** the form submission handler in the website Worker to POST to the ops Worker:

```javascript
// In the website Worker, on form submission
const orderData = {
  source: 'website',
  customer_name: formData.firstName + ' ' + formData.lastName,
  customer_phone: formData.phone,
  customer_email: formData.email,
  delivery_zone: formData.deliveryRegion,
  delivery_address: formData.deliveryAddress,
  personalisation_note: formData.personalisationNote,
  items: formData.items,
  notes: formData.notes
};

await fetch('https://mala-ops.YOUR_SUBDOMAIN.workers.dev/api/webhook/website', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': env.WEBHOOK_SECRET },
  body: JSON.stringify(orderData)
});
```

The ops Worker validates the secret, creates the order in D1, and returns 200. The website's success state triggers as normal.

---

## Offline Behaviour

Register a service worker on the Jessy interface only.

- Cache the app shell on install
- Cache the last known stock state from `/api/stock`
- When offline: sales and batch entries queue in IndexedDB
- On reconnection: sync queue to D1 in chronological order
- Show a subtle sync status indicator in the tab bar (green dot = online, amber = queued items pending sync)

---

## PWA Manifest

```json
{
  "name": "Mala — Épices",
  "short_name": "Mala",
  "start_url": "/jessy",
  "display": "standalone",
  "background_color": "#1B4332",
  "theme_color": "#1B4332",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

---

## Environment Variables

```toml
# wrangler.toml
name = "mala-ops"
main = "src/index.js"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "mala-ops"
database_id = "YOUR_D1_ID"

[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_KV_ID"

[vars]
ALLOWED_ORIGIN = "https://mala-ops.pages.dev"

# Set these as secrets via wrangler secret put
# JESSY_PIN
# ADMIN_PIN
# WEBHOOK_SECRET
```

---

## Build Order for Claude Code

Follow this sequence. Do not skip ahead.

1. **Schema and seed** — Create `schema.sql` and `seed.sql`. Run via wrangler.
2. **Worker skeleton** — Entry point, routing, CORS, auth middleware.
3. **API routes** — One by one: orders, batches, expenses, sales, customers, stock, dashboard, webhook.
4. **Jessy's interface** — PIN screen, tab navigation, Sale tab, Deliveries tab, New Batch tab, Stock tab.
5. **Admin dashboard** — Sidebar, Dashboard page, Orders page, Customers page, Batches page, Expenses page, Stock page, Reports page.
6. **Service worker** — Offline queue for Jessy's interface.
7. **Webhook** — Modify website Worker to POST to ops Worker on form submit.
8. **Deploy** — `wrangler deploy` for Worker, `wrangler pages deploy` for app.

---

## First Message to Claude Code

> "I have a live website at `mala-spices.ruben-ramdhony.workers.dev` on Cloudflare Workers. I need to build a separate operations system on the same Cloudflare account. The system has two parts: a Cloudflare Worker API with D1 database, and a React PWA with two views — a mobile interface for my wife Jessy who records sales and batches in the field, and an admin dashboard for me to manage orders, customers, expenses and reports. The brand is a premium artisanal spice business from Mauritius. Here is the full technical brief."
>
> *[paste this document]*

---

*This brief is complete. All decisions are made. All data structures are defined. The only variables Claude Code cannot know are your Cloudflare account ID, D1 database ID, KV namespace ID, and the WhatsApp Business number — provide these at the start of the session.*

