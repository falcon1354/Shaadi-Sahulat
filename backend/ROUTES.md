# ShaadiSahulat Backend — Routes Reference

All routes return `{ success: boolean, ...data }` or `{ success: false, error: string }`.

## Auth convention (no JWT)

The host project uses **header-based** auth (the frontend stores sessions in
localStorage). All protected BNPL/Order routes expect these headers:

| Header            | Required for         | Notes                                              |
|-------------------|----------------------|----------------------------------------------------|
| `x-user-id`       | buyer/seller/admin   | buyer_id / seller_id / admin_id                    |
| `x-user-role`     | buyer/seller/admin   | "buyer" \| "seller" \| "admin"                     |
| `x-officer-token` | bank officer         | Token returned by `POST /api/bank/login`           |

---

## BNPL — Buyer (`/api/bnpl`)

| Method | Path                                          | Auth   | Purpose                                       |
|--------|-----------------------------------------------|--------|-----------------------------------------------|
| GET    | `/eligibility?amount=70000`                   | buyer  | Step 2 pre-check (returns `fast_path: true` if < PKR 50k + prior approved) |
| GET    | `/banks`                                      | —      | List active partner banks (HBL, MCB)          |
| GET    | `/profile`                                    | buyer  | Buyer's BNPL profile (CNIC masked)            |
| POST   | `/applications`                               | buyer  | Step 3 — multipart: cnic_front, cnic_back, utility_bill + JSON fields `order_id, bank_id, iban, account_title, plan_months(3|6), confirm=true`. Runs OCR on CNIC. |
| GET    | `/applications`                               | buyer  | List buyer's applications                     |
| GET    | `/applications/:application_no`               | buyer  | Single application + offer + documents        |
| POST   | `/applications/:application_no/accept-offer`  | buyer  | Step 7 — accept offer (order → CONFIRMED)     |
| POST   | `/applications/:application_no/decline-offer` | buyer  | Step 7 — decline offer (order → CANCELLED)    |

## Bank Officer (`/api/bank`)

| Method | Path                                            | Auth   | Purpose                                       |
|--------|-------------------------------------------------|--------|-----------------------------------------------|
| POST   | `/login`                                        | —      | Body: `{email, password}`. Default: `officer@bank.com / bank123`. Returns `token`. |
| GET    | `/applications?status=PENDING_BANK_VERIFICATION` | officer | List applications + today's stats          |
| GET    | `/applications/:application_no`                 | officer | Step 6A — full detail with OCR vs buyer CNIC mismatch warning |
| GET    | `/applications/:application_no/document/:doc_id` | officer | Serve raw file from disk                    |
| POST   | `/applications/:application_no/decision`        | officer | Step 6C+7. Body: `{decision: "APPROVE"\|"REJECT", reason?, plan_months?, risk_score?, risk_category?, comment?}` |

## Orders (`/api/orders`)

| Method | Path                                            | Auth   | Purpose                                       |
|--------|-------------------------------------------------|--------|-----------------------------------------------|
| POST   | `/`                                             | buyer  | Create order from cart. Body: `{items[], shipping_address, payment_method:"COD"\|"BNPL", bnpl_application_id?}`. Splits into packages by seller. Notifies seller + admin. |
| GET    | `/?buyer_id=`                                   | —      | List buyer's orders                           |
| GET    | `/?seller_id=`                                  | —      | List seller's packages (with parent order)   |
| GET    | `/:order_id`                                    | —      | Order detail + packages + disputes            |
| GET    | `/:order_id/packages`                           | —      | Packages for an order                         |
| POST   | `/packages/:package_id/location`                | seller | Step 2 — get customer address + shipping options |
| POST   | `/packages/:package_id/preparing`               | seller | Step 3 sub — mark PREPARING                   |
| POST   | `/packages/:package_id/shipping`                | seller | Step 3 — body `{shipping_method, courier_company, tracking_number, distance_km}`. Marks SHIPPED, adds shipping to order total, notifies buyer + admin. |
| POST   | `/packages/:package_id/delivered`               | seller | Step 5 — body `{delivery_note, recipient_name}`. Marks DELIVERED, asks buyer to confirm. |
| POST   | `/:order_id/buyer-confirm`                      | buyer  | Step 6 — body `{confirmation: "RECEIVED"\|"NOT_RECEIVED"\|"PROBLEM", problem_type?, title?, description?}`. NOT_RECEIVED / PROBLEM creates a dispute. |
| POST   | `/:order_id/review`                             | buyer  | Step 6 Option A — body `{rating(1-5), comment?, recommend?}`. Creates one Review per product in the order. |

## Disputes (`/api/disputes`)

| Method | Path                              | Auth   | Purpose                                       |
|--------|-----------------------------------|--------|-----------------------------------------------|
| GET    | `/?role=buyer\|seller\|admin&id=` | —      | List disputes for that party                  |
| GET    | `/:dispute_id`                    | —      | Dispute detail + messages                     |
| POST   | `/:dispute_id/messages`           | —      | Step 7 — body `{from_role, from_id, from_name, message}` |
| POST   | `/:dispute_id/evidence`           | —      | Multipart upload (up to 5 files). Body also includes `from_id, from_role`. |
| POST   | `/:dispute_id/admin-decision`     | admin  | Step 8 — body `{decision: "RESOLVED"\|"CANCELLED", notes}`. RESOLVED → order → DELIVERED (ready for payment release). CANCELLED → order → CANCELLED. |

## Reviews (`/api/reviews`) — public

| Method | Path                       | Purpose                                       |
|--------|----------------------------|-----------------------------------------------|
| GET    | `/product/:product_id`     | List visible reviews + average rating         |
| GET    | `/seller/:seller_id`       | Aggregate seller rating                       |

## Notifications (`/api/notifications`)

| Method | Path                              | Purpose                                       |
|--------|-----------------------------------|-----------------------------------------------|
| GET    | `/?user_id=&role=`                | List notifications (newest first, last 100)   |
| POST   | `/:id/read`                       | Mark one as read                              |
| POST   | `/read-all?user_id=&role=`        | Mark all as read                              |

## Seller extensions (`/api/seller/orders`)

| Method | Path                          | Auth   | Purpose                                       |
|--------|-------------------------------|--------|-----------------------------------------------|
| GET    | `/`                           | seller | Seller's packages (with parent order)         |
| GET    | `/:package_id`                | seller | Single package detail                         |
| GET    | `/:package_id/location`       | seller | Same as POST /api/orders/packages/:id/location but GET |

## Admin extensions (`/api/admin/*`)

| Method | Path                                        | Purpose                                       |
|--------|---------------------------------------------|-----------------------------------------------|
| GET    | `/orders?status=&q=`                        | All orders (filter by status / search)        |
| GET    | `/orders/:order_id`                         | Full order detail + packages + disputes + payout + bnpl |
| GET    | `/disputes`                                 | All disputes                                  |
| POST   | `/orders/:order_id/release-payment`         | Step 10 — body `{admin_id}` (read from header). Validates order is DELIVERED/RESOLVED. Creates SellerPayout, updates AdminWallet ledger, order → COMPLETED. |
| GET    | `/wallet`                                   | AdminWallet balance + recent ledger + payouts |
| GET    | `/sellers/:seller_id/payouts`               | List payouts to a seller                      |
| GET    | `/bnpl/applications?status=`                | All BNPL applications (admin oversight)       |

---

## Order Status Lifecycle

```
PENDING_BNPL_APPROVAL  (BNPL only — application just submitted)
        │
        ▼ (bank approves + buyer accepts offer)
   CONFIRMED  ← COD also starts here
        │
        ▼ (seller starts preparing)
   PREPARING
        │
        ▼ (seller ships, tracking # recorded)
    SHIPPED
        │
        ▼ (seller confirms delivery)
   DELIVERED
        │
        ├─ buyer confirms RECEIVED → stays DELIVERED → admin releases payment → COMPLETED
        │
        └─ buyer reports NOT_RECEIVED / PROBLEM → DISPUTED
                                                       │
                                                       ├─ admin RESOLVED → back to DELIVERED → COMPLETED
                                                       └─ admin CANCELLED → CANCELLED (final)
```

## BNPL Application Status Lifecycle

```
PENDING_BNPL_APPROVAL
        │ (buyer submits application with docs)
        ▼
PENDING_BANK_VERIFICATION
        │
        ├─ bank APPROVE → APPROVED → (offer letter, 3-day expiry)
        │                       ├─ buyer accepts → OFFER_ACCEPTED (order CONFIRMED)
        │                       ├─ buyer declines → OFFER_DECLINED (order CANCELLED)
        │                       └─ 3 days pass → OFFER_EXPIRED
        │
        └─ bank REJECT → REJECTED (order CANCELLED)

If amount < PKR 50,000 AND buyer has prior APPROVED app →
  fast-path: status jumps directly to APPROVED on submission.
```

## Uploads layout

```
<project_root>/Uploads/
├── BNPL/{buyer_id}/{application_no}/
│     ├── cnic_front.jpg
│     ├── cnic_back.jpg
│     └── utility_bill.pdf
├── Order/{order_id}/...
├── Dispute/{dispute_id}/...
└── .ocr-tmp/    (transient OCR work files, auto-deleted)
```

Files served at `http://localhost:5000/uploads/<relative_path>`.

## Seed commands

```bash
cd backend
node seeds/seedBnplBanks.js       # creates HBL + MCB
node seeds/seedAdminWallet.js     # creates admin_wallet_001 with PKR 10M balance
```

## Bank officer test credentials

```
email:    officer@bank.com
password: bank123
```
