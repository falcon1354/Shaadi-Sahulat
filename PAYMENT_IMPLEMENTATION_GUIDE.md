# Shaadi Sahulat — Payment & Refund Implementation Guide
## Plain Language — Exact Instructions for Developers and LLMs

> Read each section carefully. Every section says WHEN something happens and WHAT to do step by step. Nothing is left vague.

---

## SECTION 1 — The Two Payment Methods

### COD (Cash on Delivery)
- Buyer pays cash at the door when item is delivered. Platform never touches this cash.
- Seller physically collects the cash from the courier.
- Admin Wallet does NOT track the product price or payout for COD orders.
- Admin Wallet ONLY shows the platform commission (5%) as a green (+) credit when the order completes.
- and as already implent some basic info about the Project
- All other order details (item price, seller payout amount) are visible inside the Orders section only.
- There is NO payment release button for COD. It completes automatically.


### BNPL (Buy Now Pay Later)
- A bank (Banker) pays the full order amount to Admin on behalf of the buyer.
- The buyer then repays the bank in monthly installments. That is the bank's business.
- Admin holds the money until the order completes, then manually releases it to the seller.
{
- Admin Wallet tracks all BNPL money received from the bank and all payouts to sellers.
- There IS a payment release button for BNPL. Admin must click it manually after order completes.
Keep them Sepreate from Wallet main Page , Like it must be a New Page inside the admin wallet with different Tab
}  --

## SECTION 2 — Admin Wallet: What Goes In and What Goes Out

### For COD Orders:
- When an order is COMPLETED → add platform commission (5% of order subtotal) as CREDIT (+) in green.
- Do NOT add or subtract the full order amount.
- Do NOT create a payout record from Admin Wallet for COD. Seller got cash physically.

```
Example:
  Order subtotal: PKR 10,000
  Platform fee (5%): PKR 500
  Admin Wallet CREDIT: +PKR 500 (green)
  That's it. Nothing else happens in Admin Wallet for COD.
```

### For BNPL Orders:
- Done them as Same way like they are already implemented in the existing project codebase. like Green + amount for reciept from bank and same for payout red - amount 



### New Section Inside Admin Wallet — "BNPL Receipts from Bank":
This is a separate Page open new Url when click on onspecific Tab inside the Admin Wallet panel. It shows:
- Each day's total amount received from the bank
- Each individual BNPL order that was part of that day's batch
- Running total of all BNPL money ever received
- This data is READ from the BnplBatchRelease records (see Section 6)

---

## SECTION 3 — Stock: When to Reduce and When to Restore

### REDUCE stock when:
Buyer successfully places an order. Immediately reduce stock for every item.

```js
for (const item of order.items) {
  await Product.updateOne(
    { product_id: item.product_id },
    { $inc: { stock_quantity: -item.qty } }
  );
}
```

### RESTORE stock when (all cases):

| Case | When | Action |
|---|---|---|
| Admin cancels order | Order.status set to CANCELLED | Call restoreStock(order_id) |
| Seller cancels (before shipped) | Seller cancels before SHIPPED status | Call restoreStock(order_id) |
| BNPL rejected by bank | BnplApplication.status = REJECTED | Call restoreStock(order_id) |
| Buyer declines BNPL offer | BnplApplication.status = OFFER_DECLINED | Call restoreStock(order_id) |
| BNPL offer expires | BnplApplication.status = OFFER_EXPIRED | Call restoreStock(order_id) |
| Dispute: Buyer Wins | Admin marks Buyer Wins | Call restoreStock(order_id) |

Do NOT restore stock when: Seller Wins a dispute. Item stays with buyer.

### The restoreStock function (write once, call everywhere):
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
module.exports = { restoreStock };
```

---

## SECTION 4 — COD Order: Step by Step

### Step 1: Buyer checks out with COD
- Create Order. Set status = "CONFIRMED", payment_status = "UNPAID"
- Reduce stock for all items
- Notify seller: new order waiting

### Step 2: Seller prepares
- Order.status = "PREPARING"
- Add timeline entry

### Step 3: Seller ships
- Order.status = "SHIPPED"
- Save tracking number
- Add timeline entry

### Step 4: Seller marks delivered
- Order.status = "DELIVERED"
- Set delivered_at = now
- Set auto_complete_at = now + 7 days
- Notify buyer: "Item delivered. You have 7 days to raise a dispute if something is wrong."

### Step 5a: Buyer raises dispute (within 7 days)
- Order.status = "DISPUTED"
- Create Dispute document
- Go to Section 7 for what happens next

### Step 5b: No dispute — buyer confirms receipt manually
- Order.status = "COMPLETED"
- payment_status = "RELEASED"
- Admin Wallet CREDIT: +platform fee (5% of subtotal) — GREEN
- Notify seller: "Order complete. You earned PKR X."
- NO payout release button for COD. Just mark complete and log the commission.

### Step 5c: No dispute, 7 days pass (auto-complete by cron job)
- Same as Step 5b. Cron checks daily for orders where auto_complete_at is past and status is still DELIVERED.

---

## SECTION 5 — BNPL Order: Step by Step

### Step 1: Buyer checks out with BNPL
- Create Order. Set status = "PENDING_BNPL_APPROVAL", payment_status = "PENDING"
- Create BnplApplication. Set status = "PENDING_BNPL_APPROVAL"
- Reduce stock (reserve it)
- Do NOT notify seller yet

### Step 2: Buyer submits documents
- BnplApplication.status = "PENDING_BANK_VERIFICATION"
- Notify bank officer

### Step 3a: Bank REJECTS
- BnplApplication.status = "REJECTED"
- Order.status = "CANCELLED"
- Restore stock
- Notify buyer: "Application rejected. Order cancelled."

### Step 3b: Bank APPROVES
- BnplApplication.status = "APPROVED"
- Generate offer letter
- Set offer_expires_at = now + 3 days
- Notify buyer to accept/decline

### Step 4a: Buyer DECLINES offer
- BnplApplication.status = "OFFER_DECLINED"
- Order.status = "CANCELLED"
- Restore stock

### Step 4b: Offer EXPIRES (cron job)
- BnplApplication.status = "OFFER_EXPIRED"
- Order.status = "CANCELLED"
- Restore stock

### Step 4c: Buyer ACCEPTS offer
- BnplApplication.status = "OFFER_ACCEPTED"
- Order.status = "CONFIRMED"
- payment_status = "ON_HOLD"
- The amount is added to the bank's pending batch (see Section 6 — Banker Module)
- Notify seller: new order is ready

### Steps 5–8: Same as COD (PREPARING → SHIPPED → DELIVERED → COMPLETED/DISPUTED)

### Step 9: Admin releases payment (BNPL only — manual action)
- Admin sees a "Release Payment" button on completed BNPL orders
- On click:
  1. Calculate net_to_seller = subtotal - (subtotal × 0.05) - shipping
  2. Create SellerPayout record
  3. Seller.wallet_balance += net_to_seller
  4. AdminWallet.balance -= net_to_seller
  5. Add AdminWallet DEBIT ledger entry
  6. Order.payment_status = "RELEASED"
  7. Order.payment_released_at = now
  8. Notify seller: "Payment of PKR X released."

---

## SECTION 6 — New Module: Banker Batch Release System

### How it works:
- Every day at a fixed time (e.g., midnight or end of day), the system collects all BNPL orders that were accepted (OFFER_ACCEPTED) in the last 24 hours.
- These are batched together and their total amount is "released" to Admin.
- After this release, Admin Wallet receives the credit.
- Both the Banker Module and Admin Wallet show this batch history.

### What to build — BnplBatchRelease model:
```js
// models/BnplBatchRelease.js
const bnplBatchSchema = new mongoose.Schema({
  batch_id:       { type: String, required: true, unique: true }, // BATCH-2026-001
  release_date:   { type: Date, required: true },                 // The day this batch covers
  released_at:    { type: Date, default: Date.now },              // When actually transferred
  total_amount:   { type: Number, required: true },               // Sum of all order amounts
  order_count:    { type: Number, default: 0 },
  orders: [{
    order_id:     { type: String },
    buyer_name:   { type: String },
    amount:       { type: Number },
    bnpl_app_no:  { type: String },
    accepted_at:  { type: Date },
  }],
  status: {
    type: String,
    enum: ["PENDING", "RELEASED"],
    default: "PENDING"
  },
}, { timestamps: true });
module.exports = mongoose.model("BnplBatchRelease", bnplBatchSchema, "bnpl_batch_releases");
```

### Cron Job — runs every 24 hours:
```
1. Find all BnplApplications with status = "OFFER_ACCEPTED"
   AND accepted in the last 24 hours
   AND not already included in a batch

2. Sum up their order amounts → total_amount

3. Create a BnplBatchRelease document with all these orders

4. Set batch.status = "RELEASED"

5. Credit AdminWallet.balance += total_amount

6. Add AdminWallet ledger CREDIT entry:
   {
     type: "CREDIT",
     amount: total_amount,
     description: "BNPL batch from bank — " + batch_id,
     at: now
   }

7. Mark each BnplApplication as included in this batch
   (add batch_id field to BnplApplication)
```

### What the Banker sees in the Banker Module:
- A list of all batches by date
- For each batch: total amount, number of orders, list of orders (order ID, buyer name, amount, accepted date)
- A running total: "Total amount released to Admin to date: PKR X"
- Status of each batch (PENDING / RELEASED)

### What Admin sees in the "BNPL Receipts" section of Admin Wallet:
- Same batch list as Banker (same data, same view)
- Day-wise: date, total received that day, number of orders
- Grand total at the top: "Total received from Bank to date: PKR X"
- Each row is expandable to show individual orders in that batch

---

## SECTION 7 — Disputes: Only 2 Outcomes

> There are ONLY TWO options. No Compromise. No Force Replacement. No Partial. Just these two.

---

### OUTCOME 1 — BUYER WINS

**What this means:** The buyer has a valid complaint. Order is cancelled. Buyer gets a refund.

**What Admin does:** Clicks "Buyer Wins" button in the Dispute panel.

**What the system does — step by step:**
1. Dispute.status = "RESOLVED"
2. Dispute.outcome_code = "BUYER_WINS"
3. Order.status = "CANCELLED"
4. Order.payment_status = "CANCELLED"
5. Restore stock: call restoreStock(order_id)
6. For COD orders:
   - No money was held by platform.
   - Record the refund note: "Cash Refund — buyer to collect from seller or admin arranges manually."
   - Admin Wallet: NO change (platform never had the money).
7. For BNPL orders:
   - AdminWallet.balance -= order.total_amount
   - Add AdminWallet DEBIT ledger entry: "Refund for cancelled order " + order_id
   - BnplApplication.status = "CANCELLED"
   - Note: Bank must be contacted to cancel buyer's installment plan (manual step outside platform).
8. Notify buyer: "Your dispute was resolved. Order cancelled. Refund will be processed."
9. Notify seller: "Dispute resolved in buyer's favor. Order cancelled."
10. No further dispute option appears on this order.

---

### OUTCOME 2 — SELLER WINS

**What this means:** The seller was right. Item was correctly delivered. Buyer must confirm receipt.

**What Admin does:** Clicks "Seller Wins" button in the Dispute panel.

**What the system does — step by step:**
1. Dispute.status = "RESOLVED"
2. Dispute.outcome_code = "SELLER_WINS"
3. Order.status = "DELIVERED" (reset back to delivered — buyer must now confirm)
4. Set a 2-day deadline: seller_win_confirm_deadline = now + 2 days
5. Notify buyer: "Dispute resolved in seller's favor. Please confirm receipt within 2 days."
6. Show a "Confirm Receipt" button on the buyer's order page.

**If buyer clicks "Confirm Receipt" within 2 days:**
7. Order.status = "COMPLETED"
8. payment_status = "RELEASED"
9. For COD: Admin Wallet CREDIT += platform fee (5%). Seller keeps cash they collected.
10. For BNPL: Admin releases payment manually (Release button appears for admin).
11. Notify seller: "Order confirmed by buyer. Payment released."
12. The dispute option will NOT appear again on this order.

**If buyer does NOT confirm within 2 days (cron job handles this):**
7. Cron checks daily for orders where seller_win_confirm_deadline has passed.
8. Auto-set Order.status = "COMPLETED"
9. Run same payout steps as above (platform fee credit for COD, release button for BNPL).
10. Notify buyer: "Order auto-completed after 2 days."
11. The dispute option will NOT appear again on this order.

---

## SECTION 8 — Edge Cases

### Case A: Seller cancels a BNPL order after bank already paid Admin
The bank's batch already credited Admin Wallet.

What to do:
1. Order.status = "CANCELLED"
2. AdminWallet.balance -= order.total_amount (give it back)
3. BnplApplication.status = "CANCELLED"
4. Restore stock
5. Note: Bank must cancel buyer's installment plan manually

### Case B: Multi-seller order — dispute on one package only
Example: Buyer ordered from Seller A and Seller B.
- Only the disputed package enters DISPUTED.
- Seller B's package continues normally.
- Restore stock only for disputed package items if Buyer Wins.
- Do NOT affect Seller B.

### Case C: Buyer tries to raise dispute after 7 days
- Block it at the API level. Return error: "Dispute window has closed."
- Order is already COMPLETED, seller already paid.

### Case D: Buyer defaults on BNPL bank installments after order completes
- Not the platform's problem. Bank handles this.
- Do not touch any order, wallet, or payout records.

---

## SECTION 9 — New Fields Needed in Existing Models

### Add to Order model:
```js
seller_win_confirm_deadline: { type: Date, default: null },
// Set when Admin clicks "Seller Wins" in a dispute.
// Cron auto-completes if this date passes and order is still "DELIVERED".
```

### Add to BnplApplication model:
```js
batch_id: { type: String, default: "" },
// Set when this application is included in a BnplBatchRelease.
// Prevents double-counting in future batches.
```

---

## SECTION 10 — What Needs to Be Built (Checklist)

### New Files to Create:
- [ ] `models/BnplBatchRelease.js` — schema shown in Section 6
- [ ] `services/stockService.js` — restoreStock() function from Section 3
- [ ] `services/bnplBatchService.js` — cron logic to batch BNPL releases

### New Fields to Add:
- [ ] Order.seller_win_confirm_deadline (Date)
- [ ] BnplApplication.batch_id (String)

### New API Endpoints:
- [ ] GET /api/admin/bnpl-receipts — list of all BnplBatchRelease records for Admin
- [ ] GET /api/banker/batch-history — same data for Banker panel
- [ ] POST /api/disputes/:id/resolve — with body { outcome: "BUYER_WINS" or "SELLER_WINS" }

### Admin Wallet UI Changes:
- [ ] Show COD platform fee as GREEN (+) only — not full order amount
- [ ] Add a new "BNPL Receipts from Bank" tab — shows daily batch history
- [ ] Remove deduct/release UI for COD orders

### Admin Dispute UI Changes:
- [ ] Remove "Compromise" button
- [ ] Remove "Force Replacement" button
- [ ] Remove "Partial Refund" button
- [ ] Keep ONLY: "Buyer Wins" and "Seller Wins"

### Cron Jobs:
- [ ] Daily: Auto-complete DELIVERED orders older than 7 days (no dispute)
- [ ] Daily: Auto-complete orders where seller_win_confirm_deadline has passed
- [ ] Daily: Batch BNPL amounts from last 24h and release to Admin Wallet
- [ ] Daily: Cancel BNPL orders where offer_expires_at has passed

---

## SECTION 11 — Quick Answers to Common Questions

**Q: Why does Admin Wallet not show the product price for COD?**
A: Because the platform never holds COD money. Only the 5% commission is the platform's income. Showing the full amount as Red negative would be misleading.

**Q: Does Admin need to do anything for a COD order to complete?**
A: No. It auto-completes after 7 days if no dispute, or immediately when buyer confirms. No manual release button.

**Q: When does Admin need to manually act for BNPL?**
A: Only to release payment to seller after order completes. Admin clicks "Release Payment" button.

**Q: Can a buyer raise a dispute after Seller Wins and the order auto-completes?**
A: No. Once the order reaches COMPLETED status (either by buyer confirmation or auto-complete), the dispute option is permanently removed.

**Q: What if a COD buyer wins the dispute — who gives them the cash back?**
A: The platform records it as "Cash Refund". The Admin or seller must arrange to return cash to the buyer manually. The platform cannot send COD cash back digitally.

**Q: Does the Banker see the same data as the Admin BNPL receipts section?**
A: Yes. Both read from the same BnplBatchRelease collection. The Banker sees it as "money I sent to platform". The Admin sees it as "money I received from bank".

---

*This document is the complete implementation specification for Shaadi Sahulat payment flows.*
*Any developer or AI should be able to build the full system from these instructions alone.*
