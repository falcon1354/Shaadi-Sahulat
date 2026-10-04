# 💳 Shaadi Sahulat — Payment, Refund & Stock Lifecycle

> **Purpose:** This document is the single source of truth for every financial and inventory state-change in the platform. It covers COD, BNPL, dispute outcomes, stock restoration, and the proposed Buyer Wallet.

---

## Table of Contents

1. [Payment Methods Overview](#1-payment-methods-overview)
2. [Complete Order Lifecycle — COD](#2-complete-order-lifecycle--cod)
3. [Complete Order Lifecycle — BNPL](#3-complete-order-lifecycle--bnpl)
4. [Stock Management — Reduce & Restore](#4-stock-management--reduce--restore)
5. [Escrow Flow — Where Does the Money Sit?](#5-escrow-flow--where-does-the-money-sit)
6. [Dispute Resolution — All Outcomes](#6-dispute-resolution--all-outcomes)
7. [Refund Logic by Payment Method](#7-refund-logic-by-payment-method)
8. [Buyer Wallet — Architecture](#8-buyer-wallet--architecture)
9. [Admin Wallet Ledger](#9-admin-wallet-ledger)
10. [Seller Payout Flow](#10-seller-payout-flow)
11. [Edge Cases & Special Scenarios](#11-edge-cases--special-scenarios)
12. [Status Enums Quick Reference](#12-status-enums-quick-reference)

---

## 1. Payment Methods Overview

| Feature | COD (Cash on Delivery) | BNPL (Buy Now Pay Later) |
|---|---|---|
| **When buyer pays** | On delivery (physical cash) | Monthly installments via bank |
| **Escrow needed?** | No — cash collected at door | Yes — bank transfers full amount to Admin Escrow after approval |
| **Who pays Admin first?** | Seller collects, Admin never holds COD cash | Bank (transfers order amount to Admin after OFFER_ACCEPTED) |
| **Delivery charges** | Buyer pays upfront at checkout | Buyer pays delivery charge upfront; rest on BNPL plan |
| **Risk if order disputed** | Admin must deduct from Seller wallet | Admin refunds from Escrow (bank already paid Admin) |
| **Bank involvement** | None | Bank verifies buyer CNIC, IBAN, and approves/rejects |

---

## 2. Complete Order Lifecycle — COD

```
BUYER CHECKOUT (COD)
        |
        v
Order Created
  Order.status = CONFIRMED
  payment_status = UNPAID
        |
        v
PREPARING  --> Seller accepts and prepares package
        |
        v
SHIPPED    --> Seller adds tracking number
        |
        v
DELIVERED
  delivered_at = now
  auto_complete_at = now + 7 days
  Buyer has 7 days to raise dispute
        |
    ----+--------------------------------------------
    |                                               |
(A) No dispute within 7 days              (B) Buyer raises dispute
    |                                               |
    v                                               v
COMPLETED                                    DISPUTED
Admin releases payment to Seller         (see Section 6)

net_to_seller = subtotal - 5% fee - shipping deduction

COD Payment Flow:
  Buyer pays CASH to courier on delivery
  Courier hands cash to Seller
  Admin monitors and marks COMPLETED
  Admin releases payment from Admin Wallet (dummy) --> Seller Wallet
  SellerPayout record is created
```

> **Note — COD Reality:** The Admin never physically holds COD cash. The "Admin Wallet" in this FYP is a **dummy escrow balance** (starts at PKR 10,000,000). When Admin releases payment, a SellerPayout record is created and Admin.wallet_balance decrements — simulating the payout.

---

## 3. Complete Order Lifecycle — BNPL

```
BUYER CHECKOUT (BNPL)
        |
        v
Order Created
  Order.status = PENDING_BNPL_APPROVAL
  payment_status = PENDING
  BnplApplication status = PENDING_BNPL_APPROVAL
        |
        | Buyer submits CNIC, IBAN, documents
        v
PENDING_BANK_VERIFICATION
  Bank officer reviews:
    - cnic_match
    - iban_valid
    - identity_confirmed
    - documents_complete
        |
    ----+------------------
    |                     |
APPROVED              REJECTED
    |                     |
    v                     v
Offer Letter          Order CANCELLED
Generated             Stock Restored
(3-day window)        (see Section 4)
    |
----+--------------------
|                       |
Buyer Accepts       Buyer Declines / Expires
(OFFER_ACCEPTED)        |
    |                   v
    v              Order CANCELLED
CONFIRMED          Stock Restored
Bank pays full
order amount to
Admin Escrow
payment_status = ON_HOLD
    |
    v  (same as COD from here)
PREPARING --> SHIPPED --> DELIVERED
    |
No dispute --> COMPLETED --> Admin releases to Seller
    |
Dispute --> (see Section 6)
```

### BNPL Installment Plan (Bank Side)

```
After OFFER_ACCEPTED:

  Bank pays Admin: Full order amount (e.g., PKR 50,000) upfront

  Buyer pays Bank: Monthly installments
    - 3-month plan: PKR 50,000 / 3 = ~PKR 16,667/month + interest
    - 6-month plan: PKR 50,000 / 6 = ~PKR 8,333/month + interest

  Platform concern: ONLY the Admin --> Seller flow
  Bank concern:     Managing buyer installment collection
```

> **Key Insight:** Once the bank pays Admin the full amount, **the platform treats it like a fully paid order**. Whether the buyer is paying the bank in installments is the bank's internal concern, not the platform's.

---

## 4. Stock Management — Reduce & Restore

### 4.1 When Does Stock REDUCE?

```
Event: Buyer places order (checkout)
  For each item in cart:
    Product.stock_quantity -= item.qty
  If stock becomes 0: Product shows "Out of Stock"
```

**Where to implement:** In the Order creation controller, after order document is saved.

```js
// Pseudocode — Order creation (controllers/orderController.js)
for (const item of order.items) {
  await Product.updateOne(
    { product_id: item.product_id, stock_quantity: { $gte: item.qty } },
    { $inc: { stock_quantity: -item.qty } }
  );
}
```

### 4.2 When Does Stock RESTORE?

| Trigger | Who Acts | Stock Action |
|---|---|---|
| **Seller cancels order** (before SHIPPED) | Seller | += qty per item |
| **Admin cancels order** (CANCELLED) | Admin | += qty per item |
| **BNPL Rejected by Bank** | System (auto) | += qty per item |
| **Buyer declines BNPL offer** | System (auto) | += qty per item |
| **BNPL offer expires** | Cron job | += qty per item |
| **Dispute: Buyer Wins (Return Required)** | Admin resolves | += qty after return confirmed |
| **Dispute: Buyer Wins (Full/Partial Refund)** | Admin resolves | += qty only if physical return required |
| **Dispute: Seller Wins** | Admin resolves | No stock change |

**Shared utility function `restoreStock(orderId)`:**

```js
// services/stockService.js
async function restoreStock(orderId) {
  const order = await Order.findOne({ order_id: orderId });
  if (!order) return;
  for (const item of order.items) {
    await Product.updateOne(
      { product_id: item.product_id },
      { $inc: { stock_quantity: item.qty } }
    );
  }
}
```

Call `restoreStock(order_id)` whenever an order is cancelled or a dispute results in a return.

---

## 5. Escrow Flow — Where Does the Money Sit?

```
COD Flow:
  [Buyer] -- cash at door --> [Courier] --> [Seller collects]
  Admin dummy wallet credits when order marked COMPLETED

BNPL Flow:
  [Bank] -- PKR full amount --> [Admin Escrow Wallet]
                                       |
                                  ON_HOLD (7 days)
                                       |
                          ,-----------+-----------,
                          |                       |
                   No Dispute              Dispute Raised
                          |                       |
                          v                       v
                  Admin Releases           Admin Holds
                          |              Until Resolved
                          v                       |
                  Seller Wallet           Dispute Decision
                  net_to_seller           (see Section 6)
                  = amount - 5%
```

### Payment Status State Machine

```
UNPAID    --> (COD order placed)        --> stays UNPAID until delivered
UNPAID    --> (BNPL bank pays)          --> ON_HOLD

ON_HOLD   --> (no dispute, 7 days)      --> RELEASED (Admin pays Seller)
ON_HOLD   --> (dispute opened)          --> stays ON_HOLD
ON_HOLD   --> (admin cancels)           --> CANCELLED
ON_HOLD   --> (admin full refund)       --> REFUNDED

RELEASED  --> (admin releases payout)   --> SellerPayout created

REFUNDED  --> (buyer wallet credited)   --> BuyerWallet credited

PARTIAL_RELEASED:
  Part  --> Seller Wallet
  Part  --> Buyer Wallet (refund credit)
```

---

## 6. Dispute Resolution — All Outcomes

### 6.1 Admin Decision Options (Cleaned Up)

> Per user request: **Remove "Compromise" and "Force Replacement"** from the Admin panel.

| Decision | outcome_code | What Happens |
|---|---|---|
| **Buyer Wins — Full Refund** | BUYER_WINS_FULL_REFUND | 100% of order amount goes to Buyer Wallet |
| **Buyer Wins — Partial Refund** | BUYER_WINS_PARTIAL_REFUND | refund_percent% to Buyer Wallet, rest to Seller |
| **Buyer Wins — Return Required** | BUYER_WINS_RETURN | Buyer returns item; stock restored; full refund issued |
| **Seller Wins** | SELLER_WINS | Seller gets full payment; no refund to buyer |

---

### 6.2 BUYER WINS — Full Refund

```
Conditions: Item not received, item damaged, wrong item sent

Actions:
  1. Order.status         --> RESOLVED
  2. Order.payment_status --> REFUNDED
  3. Dispute.status       --> RESOLVED
  4. Dispute.decision     --> "Buyer Wins — Full Refund"

  COD Orders:
    - No money was ever in Admin escrow
    - BuyerWallet.balance    += full order amount (store credit)
    - AdminWallet.balance    -= full order amount (dummy debit)
    - Seller gets NOTHING

  BNPL Orders:
    - Bank already paid Admin the full order amount
    - AdminWallet.balance    -= full order amount
    - BuyerWallet.balance    += full order amount
    - BnplApplication.status --> CANCELLED
    - Bank notified to stop installment collection (manual/external)

  5. Stock: RESTORED (qty += per item)
  6. SellerPayout: NOT created
  7. AdminWallet ledger: DEBIT entry
  8. BuyerWallet ledger: CREDIT entry
```

### 6.3 BUYER WINS — Partial Refund

```
Conditions: Partially damaged, some items missing, slight quality issue

Input: Admin sets refund_percent (e.g., 40%)

Calculations:
  refund_amount = order.total_amount * (refund_percent / 100)
  seller_amount = order.total_amount - refund_amount - platform_fee

Actions:
  1. Order.status         --> RESOLVED
  2. Order.payment_status --> PARTIAL_RELEASED
  3. Dispute.decision     --> "Buyer Wins — Partial Refund"

  COD & BNPL (same logic — bank already paid Admin for BNPL):
    - BuyerWallet.balance    += refund_amount
    - SellerPayout created for seller_amount
    - Seller.wallet_balance  += seller_amount

  4. Stock: NOT restored (item was delivered and kept by buyer)
```

### 6.4 BUYER WINS — Return Required

```
Conditions: Wrong item sent, completely different product

Phase 1 — Admin issues return instruction:
  1. Dispute.decision     --> "Return Required — Awaiting Return"
  2. Buyer ships item back (tracking number collected)
  3. Seller confirms receipt of return

Phase 2 — Return confirmed:
  4. Execute Full Refund logic (same as BUYER_WINS_FULL_REFUND)
  5. Stock.qty            += item.qty (item physically back with seller)
  6. Order.status         --> RESOLVED
```

### 6.5 SELLER WINS

```
Conditions: Dispute found frivolous, item correctly delivered

Actions:
  1. Order.status         --> COMPLETED
  2. Order.payment_status --> RELEASED
  3. Dispute.status       --> RESOLVED
  4. Dispute.decision     --> "Seller Wins"

  COD & BNPL:
    - SellerPayout created for net_to_seller
    - Seller.wallet_balance  += net_to_seller
    - AdminWallet.balance    -= net_to_seller (dummy)

  5. Stock: No change
  6. BuyerWallet: No change
```

---

## 7. Refund Logic by Payment Method

### The Core Question: "If buyer paid nothing yet (BNPL), where does the refund go?"

```
BNPL Refund Answer:

  When BNPL order is placed:
    Bank --> PKR 50,000 --> Admin Escrow
    Buyer owes Bank: 3 installments of ~PKR 17,000

  If Buyer Wins Full Refund:
    Admin Escrow --> PKR 50,000 --> Buyer Wallet (credit)
    Buyer uses Buyer Wallet credit for next purchase
    OR Admin initiates manual bank refund externally
    Bank stops installment collection

  KEY POINT:
    Platform does NOT manage installment collection.
    That is between buyer and bank.
    Platform only knows: "Bank paid us --> hold --> refund or release"
```

### COD Refund Reality

```
COD Refund Answer:

  COD = Buyer pays cash to courier/seller directly
  Platform NEVER touches COD cash

  If Buyer Wins Full Refund on COD order:
    Option 1: BuyerWallet credited (store credit)
              Buyer uses it for next purchase
    Option 2: Admin contacts seller to return cash (manual, outside platform)

  Platform approach: Issue Buyer Wallet credit
  This avoids chasing cash from sellers manually
```

### Summary Table: Who Gets What?

| Scenario | Admin Wallet | Seller Wallet | Buyer Wallet | Stock |
|---|---|---|---|---|
| Order COMPLETED (COD) | CREDIT then DEBIT (payout) | +net_to_seller | No change | Stays reduced |
| Order COMPLETED (BNPL) | Credited by bank then DEBIT (payout) | +net_to_seller | No change | Stays reduced |
| Order CANCELLED (before ship) | No change | No change | No change | **RESTORED** |
| BNPL Rejected by Bank | No change | No change | No change | **RESTORED** |
| Dispute: Buyer Full Refund | DEBIT refund amount | No credit | **+full amount** | **RESTORED** |
| Dispute: Buyer Partial Refund | DEBIT both amounts | +partial (net) | **+refund_percent** | No change |
| Dispute: Return Required | DEBIT after return confirmed | No credit | **+full amount** | **RESTORED** |
| Dispute: Seller Wins | DEBIT payout amount | **+net_to_seller** | No change | No change |

---

## 8. Buyer Wallet — Architecture

### Why It's Needed

The platform currently has no way to send a refund to the buyer. The Seller has `wallet_balance`. The Admin has `AdminWallet`. The Buyer has nothing. This is the missing piece.

### Option A: Add Fields to `models/Buyer.js`

```js
// Add to buyerSchema
wallet_balance: { type: Number, default: 0 },
wallet_ledger: {
  type: [{
    type:           { type: String, enum: ["CREDIT", "DEBIT"], required: true },
    amount:         { type: Number, required: true },
    description:    { type: String, default: "" },
    ref_order_id:   { type: String, default: "" },
    ref_dispute_id: { type: String, default: "" },
    at:             { type: Date, default: Date.now },
    by:             { type: String, default: "system" },
  }],
  default: [],
},
```

### Option B: Separate BuyerWallet Collection (Recommended)

```js
// models/BuyerWallet.js
const buyerWalletSchema = new mongoose.Schema({
  wallet_id:  { type: String, required: true, unique: true }, // "BW-" + buyer_id
  buyer_id:   { type: String, required: true, unique: true },
  buyer_name: { type: String, default: "" },
  balance:    { type: Number, default: 0 },
  currency:   { type: String, default: "PKR" },
  ledger: [{
    type:           { type: String, enum: ["CREDIT", "DEBIT"] },
    amount:         { type: Number },
    description:    { type: String, default: "" },
    ref_order_id:   { type: String, default: "" },
    ref_dispute_id: { type: String, default: "" },
    at:             { type: Date, default: Date.now },
    by:             { type: String, default: "system" },
  }],
}, { timestamps: true });
```

### Buyer Wallet Operations

```
CREDIT (Refund issued):
  BuyerWallet.balance += refund_amount
  BuyerWallet.ledger.push({
    type: "CREDIT",
    amount: refund_amount,
    description: "Dispute Refund",
    ref_dispute_id: dispute.dispute_id
  })

DEBIT (Buyer uses wallet balance for new purchase):
  BuyerWallet.balance -= purchase_amount
  BuyerWallet.ledger.push({
    type: "DEBIT",
    amount: purchase_amount,
    description: "Used for Order #ORD-xxx"
  })
```

---

## 9. Admin Wallet Ledger

```
CREDIT Events:
  + Order placed (BNPL)   -- Bank pays Admin escrow
  + Platform fee (5%)     -- On every completed order

DEBIT Events:
  - Seller Payout         -- Admin releases payment to Seller
  - Buyer Refund          -- Dispute resolves in buyer's favor
  - Order Cancelled       -- If BNPL order cancelled after bank payment
```

### Ledger Entry Format

```js
{
  type: "DEBIT",
  amount: 47500,
  description: "Seller payout for ORD-2026-12345",
  ref_order_id: "ORD-2026-12345",
  ref_payout_id: "PAY-2026-001",
  at: new Date(),
  by_admin_id: "admin_001"
}
```

---

## 10. Seller Payout Flow

```
Trigger: Admin clicks "Release Payment" on COMPLETED order

Steps:
  1. Validate: Order.status === "COMPLETED" AND payment_status !== "RELEASED"
  2. Calculate:
       platform_fee    = order.subtotal * 0.05
       net_to_seller   = order.subtotal - platform_fee - shipping_deduction
  3. Create SellerPayout document
       transaction_id  = "TXN-FYP-2026-" + sequence
  4. Seller.wallet_balance     += net_to_seller
  5. AdminWallet.balance       -= net_to_seller
  6. AdminWallet.ledger.push    DEBIT entry
  7. Order.payment_status       = "RELEASED"
  8. Order.payment_released_at  = now
  9. Order.timeline.push        { status: "PAYMENT_RELEASED", by: "admin" }
 10. Notification created for Seller
```

---

## 11. Edge Cases & Special Scenarios

### Edge Case 1: Seller Cancels After BNPL Approval But Before Shipping

```
Situation: Bank has already paid Admin (payment_status = ON_HOLD)
           Seller cannot prepare and cancels

Actions:
  Order.status           --> CANCELLED
  Order.payment_status   --> REFUNDED
  BnplApplication.status --> CANCELLED
  AdminWallet.balance    -= order.total_amount  (refund out)
  BuyerWallet.balance    += order.total_amount  (credit to buyer)
  Stock Restored: YES

  Note: Bank must be notified manually to cancel installment plan
```

### Edge Case 2: BNPL Offer Accepted But Bank Transfer Fails

```
Situation: Buyer accepted offer but bank transfer did not arrive

Actions:
  Order stays at: PENDING_BNPL_APPROVAL
  Wait 24 hours --> if no bank payment --> Order CANCELLED
  BnplApplication.status --> CANCELLED
  Stock Restored: YES
```

### Edge Case 3: Partial BNPL Refund Calculation Example

```
Order Total:   PKR 50,000
Refund: 40%  = PKR 20,000  --> Buyer Wallet
Remaining:     PKR 30,000
Platform Fee:  PKR  1,500 (5% of 30,000)
Net to Seller: PKR 28,500

AdminWallet:   -20,000 (refund) - 28,500 (seller payout) = -48,500 total debit
Platform keeps: PKR 1,500 as fee (stays in admin wallet net)
```

### Edge Case 4: Multi-Seller Order — Dispute on One Package Only

```
Situation: Buyer orders from Seller A and Seller B in same cart

Order has 2 packages:
  Package A --> Seller A --> items [product_1, product_2]
  Package B --> Seller B --> items [product_3]

Dispute raised on Package A only:
  - Package A enters DISPUTED
  - Package B proceeds normally --> COMPLETED --> Seller B gets paid
  - Stock restored only for Package A items if refund issued
  - Seller A gets nothing for disputed package
```

### Edge Case 5: BNPL Buyer Defaults on Bank Installments

```
Situation: Buyer accepted BNPL, bank paid Admin, but buyer stops paying bank

Platform Role: NONE
  - Bank already paid Admin --> Admin paid Seller
  - This is entirely between Buyer and Bank
  - Bank pursues buyer for recovery (legal/credit reporting)
  - Platform has no obligation to reverse seller payout
```

### Edge Case 6: Dispute Opened After 7-Day Window

```
Situation: auto_complete_at has passed but buyer tries to open dispute

Action:
  - System rejects dispute filing (frontend/API validation)
  - Order status is already COMPLETED
  - No refund possible through platform after completion
  - Buyer must contact Admin directly for exceptional cases
```

---

## 12. Status Enums Quick Reference

### Order.status

| Status | Meaning |
|---|---|
| PENDING_BNPL_APPROVAL | BNPL order waiting for bank decision |
| CONFIRMED | Ready for seller (COD or BNPL approved) |
| PREPARING | Seller is packing |
| SHIPPED | In transit |
| DELIVERED | Delivered to buyer |
| DISPUTED | Buyer raised issue |
| RESOLVED | Dispute closed by admin |
| CANCELLED | Order cancelled (no payment to seller) |
| COMPLETED | Payment released to seller |

### Order.payment_status

| Status | Meaning |
|---|---|
| UNPAID | COD — not yet paid |
| PENDING | BNPL application in progress |
| ON_HOLD | BNPL — bank paid Admin, held in escrow |
| RELEASED | Admin paid Seller |
| PARTIAL_RELEASED | Partial paid to Seller, rest refunded |
| REFUNDED | Full refund issued to Buyer Wallet |
| CANCELLED | Order cancelled, no money moved |

### Dispute.status

| Status | Meaning |
|---|---|
| OPEN | Just filed |
| SELLER_RESPONSE_PENDING | Waiting 48h for seller to respond |
| SELLER_RESPONDED | Seller provided response |
| BUYER_REVIEW_PENDING | Buyer reviews seller response |
| ADMIN_REVIEW_PENDING | Escalated to admin |
| UNDER_REVIEW | Admin actively reviewing |
| RESOLVED | Final decision made |
| CANCELLED | Withdrawn |

### BnplApplication.status

| Status | Meaning |
|---|---|
| PENDING_BNPL_APPROVAL | Initial state |
| PENDING_BANK_VERIFICATION | Documents submitted to bank |
| APPROVED | Bank approved, offer letter ready |
| REJECTED | Bank rejected |
| OFFER_EXPIRED | 3-day window passed |
| OFFER_ACCEPTED | Buyer accepted, plan active |
| OFFER_DECLINED | Buyer declined |
| CANCELLED | Order/dispute cancelled |

---

## Implementation Priority

```
Phase 1 — Critical (implement first):
  [ ] Create BuyerWallet model (or add fields to Buyer.js)
  [ ] restoreStock() utility in services/stockService.js
  [ ] Hook restoreStock() into order cancellation endpoints
  [ ] Hook restoreStock() into BNPL rejection/decline/expire flows

Phase 2 — Dispute Financial Flows:
  [ ] disputeResolve() with switch on outcome_code
  [ ] BUYER_WINS_FULL_REFUND -> credit BuyerWallet, debit AdminWallet
  [ ] BUYER_WINS_PARTIAL_REFUND -> split between buyer + seller
  [ ] SELLER_WINS -> trigger normal payout flow
  [ ] Remove "Compromise" and "Force Replacement" from Admin UI

Phase 3 — UI Updates:
  [ ] Buyer Panel: Show wallet balance and ledger history
  [ ] Admin Disputes: Show new 4-option decision panel
  [ ] Admin Wallet: Show refund debit entries in ledger
```

---

*Last Updated: October 2026 | Shaadi Sahulat FYP — Payment and Refund Documentation*
