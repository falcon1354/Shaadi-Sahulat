/**
 * seedFullLifecycleV2.js — Complete Product Lifecycle Dummy Data
 * ================================================================
 *
 * This seed creates EVERY entity in the Shaadi-Sahulat e-commerce
 * product flow so that all dashboards, modules, and pages have
 * real, connected data on first load.
 *
 * Product Flow (the "V.V.V ImP" requirement):
 *
 *   Seller -> Upload -> Category -> Admin -> Marketplace ->
 *   Buyer -> Add to Cart -> Checkout -> My Orders ->
 *   BNPL (optional) -> Seller Shipping -> Confirmed/Rejected ->
 *   Review -> Buyer Budget Update -> Dashboard Update ->
 *   Admin Confirm -> Amount Released -> Seller Payout ->
 *   Dashboard Updated
 *
 * What this seed creates:
 *   1. Three buyer accounts with dowry estimations + budget tracking
 *   2. Orders in EVERY lifecycle stage (9 statuses)
 *   3. Packages for each order (seller fulfillment units)
 *   4. BNPL applications (APPROVED + PENDING + REJECTED)
 *   5. BNPL offer letters with installment schedules
 *   6. Product reviews (ratings + comments + AI metadata)
 *   7. Seller payouts (5% platform fee deducted)
 *   8. Admin wallet ledger transactions (CREDIT + DEBIT)
 *   9. Notifications for buyer, seller, admin
 *   10. One dispute (OPEN status) for demo
 *   11. Product stock deductions & total_sold increments
 *   12. Buyer level upgrades & total_orders
 *   13. Category budget spent/remaining tracking
 *
 * IMPORTANT: After this seed, the platform remains DYNAMIC.
 *   New orders, reviews, payouts will continue to work on top of
 *   this seed data. The seed data is NOT "constant" — it provides
 *   the starting records that make every dashboard functional.
 *   The same seller (Ahmed Traders) has completed orders and
 *   continues selling — new buyers can still add to cart, checkout,
 *   etc., and the system will properly account for it.
 *
 * Run:  node seeds/seedFullLifecycleV2.js
 *       (must run AFTER seedAdmin.js + seedBnplBanks.js + seed_all_categories.py)
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose      = require("mongoose");
const bcrypt        = require("bcryptjs");

const Buyer           = require("../models/Buyer");
const Order           = require("../models/Order");
const Package         = require("../models/Package");
const BnplApplication = require("../models/BnplApplication");
const BnplOfferLetter = require("../models/BnplOfferLetter");
const Review          = require("../models/Review");
const SellerPayout    = require("../models/SellerPayout");
const AdminWallet     = require("../models/AdminWallet");
const Notification    = require("../models/Notification");
const Dispute         = require("../models/Dispute");
const Product         = require("../models/Product");
const DowryEstimation = require("../models/DowryEstimation");
const Admin           = require("../models/Admin");

const {
  computeSellerPayout, computePlan, buildInstallmentSchedule,
  round2,
} = require("../lib/helpers");

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/shaadi_sahulat";

const NOW       = new Date();
const YESTERDAY = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
const LAST_WEEK = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000);
const LAST_MONTH = new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000);

// Fixed IDs (deterministic)
const SELLER_ID   = "SELLER_001";
const SELLER_NAME = "Ahmed Traders";
const ADMIN_ID    = "admin_001";

// ── Buyers ──────────────────────────────────────────────────────────────────
const BUYERS = [
  {
    buyer_id:      "BUY-001",
    name:          "Aisha Khan",
    email:         "aisha@example.com",
    password_hash: bcrypt.hashSync("Buyer@1234", 10),
    phone:         "03001234567",
    city:          "Lahore",
    dowry_done:    true,
    dowry_estimation_id: "DOW-001",
    level:         "Bronze",
    total_orders:  4,
    preferred_delivery_method: "standard",
    saved_addresses: [
      {
        label:    "Home",
        line1:    "42-G Gulberg III",
        city:     "Lahore",
        province: "Punjab",
        house_number: "42-G",
        phone:    "0300-1234567",
      },
    ],
  },
  {
    buyer_id:      "BUY-002",
    name:          "Usman Ali",
    email:         "usman@example.com",
    password_hash: bcrypt.hashSync("Buyer@1234", 10),
    phone:         "03119876543",
    city:          "Karachi",
    dowry_done:    true,
    dowry_estimation_id: "DOW-002",
    level:         "Silver",
    total_orders:  5,
    preferred_delivery_method: "express",
    saved_addresses: [
      {
        label:    "Home",
        line1:    "15-B DHA Phase 5",
        city:     "Karachi",
        province: "Sindh",
        house_number: "15-B",
        phone:    "0311-9876543",
      },
    ],
  },
  {
    buyer_id:      "BUY-003",
    name:          "Fatima Noor",
    email:         "fatima@example.com",
    password_hash: bcrypt.hashSync("Buyer@1234", 10),
    phone:         "03217654321",
    city:          "Islamabad",
    dowry_done:    true,
    dowry_estimation_id: "DOW-003",
    level:         "New",
    total_orders:  1,
    preferred_delivery_method: "standard",
    saved_addresses: [
      {
        label:    "Home",
        line1:    "8-F F-8 Markaz",
        city:     "Islamabad",
        province: "Federal",
        house_number: "8-F",
        phone:    "0321-7654321",
      },
    ],
  },
];

// ── Dowry Estimations ────────────────────────────────────────────────────────
const DOWRY_ESTIMATIONS = [
  {
    user_id:   "BUY-001",
    total_recommended_budget: 350000,
    baseline_budget:          320000,
    ml_adjustment_factor:     1.09,
    responsibility_score:     0.72,
    category_breakdown: {
      wedding_dress:  65000,
      furniture:      85000,
      electronics:    55000,
      kitchen_items:  35000,
      decoration:     25000,
      miscellaneous:  15000,
    },
    category_budgets: {
      wedding_dress:  { estimated: 65000,  spent: 48000,  remaining: 17000,  active: true },
      furniture:      { estimated: 85000,  spent: 0,      remaining: 85000,  active: true },
      electronics:    { estimated: 55000,  spent: 0,      remaining: 55000,  active: true },
      kitchen_items:  { estimated: 35000,  spent: 18500,  remaining: 16500,  active: true },
      decoration:     { estimated: 25000,  spent: 0,      remaining: 25000,  active: true },
      miscellaneous:  { estimated: 15000,  spent: 4200,   remaining: 10800,  active: true },
    },
    budget_sources: { from_income: 180000, from_savings: 140000, from_contribution: 30000, income_percentage: 51, savings_percentage: 40 },
    adjusted_estimates: {},
    was_manually_adjusted: false,
    wedding_dress_type:   "bridal",
    income:                100000,
    savings:               200000,
    expected_contribution: 30000,
    total_family_members:  5,
    married_children:      0,
    unmarried_children:    2,
    ages_of_unmarried:     [24, 21],
    youngest_unmarried_age: 21,
    priorities: { priority_wedding_dress: "High", priority_furniture: "High", priority_electronics: "Medium", priority_kitchen_items: "Medium", priority_decoration: "Low", priority_miscellaneous: "Low" },
    redistributions: {},
    notes: [],
    source: "Hybrid Engine",
  },
  {
    user_id:   "BUY-002",
    total_recommended_budget: 500000,
    baseline_budget:          470000,
    ml_adjustment_factor:     1.06,
    responsibility_score:     0.85,
    category_breakdown: { wedding_dress: 100000, furniture: 120000, electronics: 90000, kitchen_items: 55000, decoration: 40000, miscellaneous: 25000 },
    category_budgets: {
      wedding_dress:  { estimated: 100000, spent: 72000,  remaining: 28000,  active: true },
      furniture:      { estimated: 120000, spent: 95000,  remaining: 25000,  active: true },
      electronics:    { estimated: 90000,  spent: 75000,  remaining: 15000,  active: true },
      kitchen_items:  { estimated: 55000,  spent: 22000,  remaining: 33000,  active: true },
      decoration:     { estimated: 40000,  spent: 3500,   remaining: 36500,  active: true },
      miscellaneous:  { estimated: 25000,  spent: 8500,   remaining: 16500,  active: true },
    },
    budget_sources: { from_income: 250000, from_savings: 200000, from_contribution: 50000, income_percentage: 50, savings_percentage: 40 },
    adjusted_estimates: {},
    was_manually_adjusted: false,
    wedding_dress_type:   "bridal",
    income:                150000,
    savings:               350000,
    expected_contribution: 50000,
    total_family_members:  6,
    married_children:      1,
    unmarried_children:    2,
    ages_of_unmarried:     [26, 22],
    youngest_unmarried_age: 22,
    priorities: { priority_wedding_dress: "High", priority_furniture: "High", priority_electronics: "High", priority_kitchen_items: "Medium", priority_decoration: "Medium", priority_miscellaneous: "Low" },
    redistributions: {},
    notes: [],
    source: "Hybrid Engine",
  },
  {
    user_id:   "BUY-003",
    total_recommended_budget: 180000,
    baseline_budget:          170000,
    ml_adjustment_factor:     1.05,
    responsibility_score:     0.60,
    category_breakdown: { wedding_dress: 40000, furniture: 45000, electronics: 30000, kitchen_items: 20000, decoration: 15000, miscellaneous: 10000 },
    category_budgets: {
      wedding_dress:  { estimated: 40000,  spent: 0,      remaining: 40000,  active: true },
      furniture:      { estimated: 45000,  spent: 0,      remaining: 45000,  active: true },
      electronics:    { estimated: 30000,  spent: 0,      remaining: 30000,  active: true },
      kitchen_items:  { estimated: 20000,  spent: 0,      remaining: 20000,  active: true },
      decoration:     { estimated: 15000,  spent: 0,      remaining: 15000,  active: true },
      miscellaneous:  { estimated: 10000,  spent: 0,      remaining: 10000,  active: true },
    },
    budget_sources: { from_income: 80000, from_savings: 80000, from_contribution: 20000, income_percentage: 44, savings_percentage: 44 },
    adjusted_estimates: {},
    was_manually_adjusted: false,
    wedding_dress_type:   "bridal",
    income:                50000,
    savings:               100000,
    expected_contribution: 20000,
    total_family_members:  4,
    married_children:      0,
    unmarried_children:    1,
    ages_of_unmarried:     [23],
    youngest_unmarried_age: 23,
    priorities: { priority_wedding_dress: "Medium", priority_furniture: "Medium", priority_electronics: "Low", priority_kitchen_items: "Low", priority_decoration: "Not_Wanted", priority_miscellaneous: "Not_Wanted" },
    redistributions: { decoration: false, miscellaneous: false },
    notes: [],
    source: "Hybrid Engine",
  },
];

// ── Order Definitions (covering ALL lifecycle statuses) ──────────────────────
const ORDER_DEFS = [
  {
    order_id: "ORD-2026-10001", buyer_id: "BUY-001", buyer_name: "Aisha Khan",
    buyer_email: "aisha@example.com", buyer_phone: "0300-1234567",
    payment_method: "COD", payment_status: "PAID", status: "COMPLETED",
    delivery_method: "standard", buyer_confirmed_receipt: true, buyer_confirmed_at: LAST_WEEK,
    categories: ["wedding_dress", "kitchen_items"],
    shipping_address: { line1: "42-G Gulberg III", city: "Lahore", province: "Punjab", house_number: "42-G", phone: "0300-1234567" },
    created_at: LAST_MONTH,
    has_review: true, has_payout: true,
    review_rating: 4.5, review_title: "Beautiful lehenga, fast delivery!",
    review_comment: "The bridal lehenga was exactly as shown in the picture. Embroidery quality is excellent and the delivery was faster than expected. Very satisfied with the purchase.",
  },
  {
    order_id: "ORD-2026-10002", buyer_id: "BUY-002", buyer_name: "Usman Ali",
    buyer_email: "usman@example.com", buyer_phone: "0311-9876543",
    payment_method: "COD", payment_status: "PAID", status: "COMPLETED",
    delivery_method: "express", buyer_confirmed_receipt: true, buyer_confirmed_at: YESTERDAY,
    categories: ["furniture", "electronics"],
    shipping_address: { line1: "15-B DHA Phase 5", city: "Karachi", province: "Sindh", house_number: "15-B", phone: "0311-9876543" },
    created_at: LAST_WEEK,
    has_review: true, has_payout: true,
    review_rating: 5, review_title: "Excellent quality, highly recommend!",
    review_comment: "The sofa set and LED TV were delivered in perfect condition. The seller was very responsive and the express delivery was worth the extra cost. 5 stars!",
  },
  {
    order_id: "ORD-2026-10003", buyer_id: "BUY-001", buyer_name: "Aisha Khan",
    buyer_email: "aisha@example.com", buyer_phone: "0300-1234567",
    payment_method: "COD", payment_status: "UNPAID", status: "DELIVERED",
    delivery_method: "standard", buyer_confirmed_receipt: false,
    categories: ["decoration"],
    shipping_address: { line1: "42-G Gulberg III", city: "Lahore", province: "Punjab", house_number: "42-G", phone: "0300-1234567" },
    created_at: YESTERDAY,
    has_review: false, has_payout: false,
  },
  {
    order_id: "ORD-2026-10004", buyer_id: "BUY-002", buyer_name: "Usman Ali",
    buyer_email: "usman@example.com", buyer_phone: "0311-9876543",
    payment_method: "COD", payment_status: "UNPAID", status: "SHIPPED",
    delivery_method: "express",
    categories: ["miscellaneous", "kitchen_items"],
    shipping_address: { line1: "15-B DHA Phase 5", city: "Karachi", province: "Sindh", house_number: "15-B", phone: "0311-9876543" },
    created_at: YESTERDAY,
    has_review: false, has_payout: false,
  },
  {
    order_id: "ORD-2026-10005", buyer_id: "BUY-003", buyer_name: "Fatima Noor",
    buyer_email: "fatima@example.com", buyer_phone: "0321-7654321",
    payment_method: "COD", payment_status: "UNPAID", status: "PREPARING",
    delivery_method: "standard",
    categories: ["wedding_dress"],
    shipping_address: { line1: "8-F F-8 Markaz", city: "Islamabad", province: "Federal", house_number: "8-F", phone: "0321-7654321" },
    created_at: NOW,
    has_review: false, has_payout: false,
  },
  {
    order_id: "ORD-2026-10006", buyer_id: "BUY-001", buyer_name: "Aisha Khan",
    buyer_email: "aisha@example.com", buyer_phone: "0300-1234567",
    payment_method: "COD", payment_status: "UNPAID", status: "CONFIRMED",
    delivery_method: "standard",
    categories: ["furniture"],
    shipping_address: { line1: "42-G Gulberg III", city: "Lahore", province: "Punjab", house_number: "42-G", phone: "0300-1234567" },
    created_at: NOW,
    has_review: false, has_payout: false,
  },
  {
    order_id: "ORD-2026-10007", buyer_id: "BUY-002", buyer_name: "Usman Ali",
    buyer_email: "usman@example.com", buyer_phone: "0311-9876543",
    payment_method: "BNPL", payment_status: "PENDING", status: "CONFIRMED",
    delivery_method: "standard",
    categories: ["furniture"], bank_processing_fee: 3200,
    bnpl_application_id: "BNPL-2026-10001",
    shipping_address: { line1: "15-B DHA Phase 5", city: "Karachi", province: "Sindh", house_number: "15-B", phone: "0311-9876543" },
    created_at: YESTERDAY,
    has_review: false, has_payout: false,
  },
  {
    order_id: "ORD-2026-10008", buyer_id: "BUY-001", buyer_name: "Aisha Khan",
    buyer_email: "aisha@example.com", buyer_phone: "0300-1234567",
    payment_method: "BNPL", payment_status: "PENDING", status: "PENDING_BNPL_APPROVAL",
    delivery_method: "standard",
    categories: ["electronics"], bank_processing_fee: 3000,
    bnpl_application_id: "BNPL-2026-10002",
    shipping_address: { line1: "42-G Gulberg III", city: "Lahore", province: "Punjab", house_number: "42-G", phone: "0300-1234567" },
    created_at: NOW,
    has_review: false, has_payout: false,
  },
  {
    order_id: "ORD-2026-10009", buyer_id: "BUY-002", buyer_name: "Usman Ali",
    buyer_email: "usman@example.com", buyer_phone: "0311-9876543",
    payment_method: "COD", payment_status: "UNPAID", status: "DISPUTED",
    delivery_method: "express",
    categories: ["electronics"],
    shipping_address: { line1: "15-B DHA Phase 5", city: "Karachi", province: "Sindh", house_number: "15-B", phone: "0311-9876543" },
    created_at: LAST_WEEK,
    has_review: false, has_payout: false, has_dispute: true,
    dispute_type: "not_received", dispute_desc: "I never received the LED TV. The tracking says delivered but nothing arrived at my address.",
  },
  {
    order_id: "ORD-2026-10010", buyer_id: "BUY-003", buyer_name: "Fatima Noor",
    buyer_email: "fatima@example.com", buyer_phone: "0321-7654321",
    payment_method: "COD", payment_status: "CANCELLED", status: "CANCELLED",
    delivery_method: "standard",
    categories: ["kitchen_items"],
    shipping_address: { line1: "8-F F-8 Markaz", city: "Islamabad", province: "Federal", house_number: "8-F", phone: "0321-7654321" },
    created_at: LAST_MONTH,
    has_review: false, has_payout: false,
  },
];

// ── BNPL Applications ────────────────────────────────────────────────────────
const BNPL_APPLICATIONS = [
  {
    application_no: "BNPL-2026-10001", buyer_id: "BUY-002", order_id: "ORD-2026-10007",
    bank_id: "hbl", amount: 80000, plan_months: 3,
    status: "OFFER_ACCEPTED",
    verification_checks: { cnic_match: true, iban_valid: true, identity_confirmed: true, documents_complete: true },
    officer_id: "officer_hbl_001",
    offer_expires_at: new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000),
  },
  {
    application_no: "BNPL-2026-10002", buyer_id: "BUY-001", order_id: "ORD-2026-10008",
    bank_id: "mcb", amount: 75000, plan_months: 6,
    status: "PENDING_BANK_VERIFICATION",
    verification_checks: { cnic_match: false, iban_valid: false, identity_confirmed: false, documents_complete: false },
  },
];

// ── BNPL Offer Letters ────────────────────────────────────────────────────────
const BNPL_OFFER_LETTERS = [
  {
    application_id: "BNPL-2026-10001", offer_no: "OFR-2026-10001",
    buyer_id: "BUY-002", approved_amount: 80000,
    plan_months: 3, processing_fee: 1600,
    monthly_installment: 27200, total_payable: 81600,
    valid_until: new Date(NOW.getTime() + 2 * 24 * 60 * 60 * 1000),
    accepted_at: YESTERDAY, status: "ACCEPTED",
    installments: buildInstallmentSchedule(27200, 3, YESTERDAY),
  },
];

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n" + "=".repeat(70));
  console.log("  ShaadiSahulat — Full Lifecycle Seed V2");
  console.log("  Creating: Buyers, Orders, Packages, BNPL, Reviews, Payouts");
  console.log("=".repeat(70));

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.\n");

  // Step 0: Verify prerequisites
  const adminCount = await Admin.countDocuments();
  if (adminCount === 0) {
    console.error("ERROR: No admin found. Run seedAdmin.js first!");
    process.exit(1);
  }
  const productCount = await Product.countDocuments();
  if (productCount === 0) {
    console.error("ERROR: No products found. Run seed_all_categories.py first!");
    process.exit(1);
  }
  console.log("[0] Prerequisites verified: " + adminCount + " admin(s), " + productCount + " products.\n");

  // Step 1: Seed Buyers
  console.log("[1] Seeding buyer accounts...");
  for (const b of BUYERS) {
    const existing = await Buyer.findOne({ buyer_id: b.buyer_id });
    if (existing) {
      console.log("  Buyer " + b.buyer_id + " (" + b.name + ") already exists — updating.");
      await Buyer.updateOne({ buyer_id: b.buyer_id }, { $set: b });
    } else {
      await Buyer.create(b);
      console.log("  Created buyer: " + b.buyer_id + " — " + b.name + " (" + b.email + ") / Buyer@1234");
    }
  }

  // Step 2: Seed Dowry Estimations
  console.log("\n[2] Seeding dowry estimations...");
  for (const d of DOWRY_ESTIMATIONS) {
    const existing = await DowryEstimation.findOne({ user_id: d.user_id });
    if (existing) {
      await DowryEstimation.deleteOne({ user_id: d.user_id });
    }
    await DowryEstimation.create(d);
    const buyer = BUYERS.find(b => b.buyer_id === d.user_id);
    console.log("  Estimation for " + d.user_id + " (" + (buyer ? buyer.name : "") + "): PKR " + d.total_recommended_budget.toLocaleString());
  }

  // Step 3: Lookup Products from DB
  console.log("\n[3] Looking up products from database...");
  const allProducts = await Product.find({}).limit(100);
  const productsByCategory = {};
  for (const p of allProducts) {
    const cat = p.major_category || p.category || "miscellaneous";
    if (!productsByCategory[cat]) productsByCategory[cat] = [];
    productsByCategory[cat].push(p);
  }
  console.log("  Found products in categories: " + Object.keys(productsByCategory).join(", "));

  function pickProduct(category) {
    const pool = productsByCategory[category] || allProducts;
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * Math.min(3, pool.length))];
  }

  // Step 4: Seed Orders + Packages
  console.log("\n[4] Seeding orders and packages...");
  const delOrders = await Order.deleteMany({ order_id: /^ORD-2026-1/ });
  const delPkgs   = await Package.deleteMany({ package_id: /^PKG-2026-1/ });
  console.log("  Removed " + delOrders.deletedCount + " old V2 orders, " + delPkgs.deletedCount + " old packages.");

  const createdOrders = [];
  const createdPackages = [];

  for (const def of ORDER_DEFS) {
    const items = [];
    let subtotal = 0;

    for (const cat of def.categories) {
      const prod = pickProduct(cat);
      if (!prod) {
        console.log("  WARNING: No product found for category \"" + cat + "\" — skipping item.");
        continue;
      }
      const price = prod.discount_price || prod.price_pkr || prod.price || 25000;
      const qty = 1;
      const itemSub = price * qty;

      items.push({
        product_id: prod.product_id, seller_id: SELLER_ID,
        title: prod.name || prod.title || "Product from " + cat,
        major_category: cat, subcategory: prod.subcategory || "",
        item_type: prod.item_type || "",
        image_url: prod.image_url || prod.primary_image_url || "",
        price: price, discount_price: prod.discount_price || null,
        qty: qty, subtotal: itemSub,
      });
      subtotal += itemSub;
    }

    if (items.length === 0) { continue; }

    const shippingCost = def.delivery_method === "express" ? 350 : 150;
    const totalAmount  = subtotal + shippingCost + (def.bank_processing_fee || 0);
    const timeline = buildTimeline(def.status, def.created_at || NOW);

    const orderDoc = {
      order_id: def.order_id, buyer_id: def.buyer_id, buyer_name: def.buyer_name,
      buyer_email: def.buyer_email, buyer_phone: def.buyer_phone,
      items: items, items_count: items.length, subtotal: subtotal,
      shipping_total: shippingCost, total_amount: totalAmount,
      shipping_address: def.shipping_address,
      payment_method: def.payment_method, payment_status: def.payment_status,
      status: def.status, delivery_method: def.delivery_method || "standard",
      bank_processing_fee: def.bank_processing_fee || 0,
      buyer_confirmed_receipt: def.buyer_confirmed_receipt || false,
      buyer_confirmed_at: def.buyer_confirmed_at || null,
      bnpl_application_id: def.bnpl_application_id || "",
      primary_seller_id: SELLER_ID,
      timeline: timeline, created_at: def.created_at || NOW,
    };

    await Order.create(orderDoc);
    createdOrders.push(orderDoc);

    const pkgPayout = computeSellerPayout(subtotal, shippingCost);
    const pkgDoc = {
      package_id: "PKG-" + def.order_id.split("-").slice(1).join("-"),
      order_id: def.order_id, seller_id: SELLER_ID, seller_name: SELLER_NAME,
      items: items.map(i => ({ product_id: i.product_id, title: i.title, price: i.price, qty: i.qty, subtotal: i.subtotal })),
      items_count: items.length, subtotal: subtotal,
      shipping_method: def.delivery_method || "standard", shipping_cost: shippingCost,
      courier_company: ["SHIPPED","DELIVERED","COMPLETED","DISPUTED"].includes(def.status) ? "TCS Express" : "",
      tracking_number: ["SHIPPED","DELIVERED","COMPLETED","DISPUTED"].includes(def.status) ? "TCSE-XA12-KZ45" : "",
      shipped_at: ["SHIPPED","DELIVERED","COMPLETED","DISPUTED"].includes(def.status) ? new Date(def.created_at.getTime() + 2*24*60*60*1000) : null,
      delivered_at: ["DELIVERED","COMPLETED","DISPUTED"].includes(def.status) ? new Date(def.created_at.getTime() + 4*24*60*60*1000) : null,
      status: mapOrderStatusToPackageStatus(def.status),
      platform_fee: pkgPayout.commission, net_to_seller: pkgPayout.net_to_seller,
      payout_released: def.status === "COMPLETED",
      payout_released_at: def.status === "COMPLETED" ? LAST_WEEK : null,
      created_at: def.created_at || NOW,
    };

    await Package.create(pkgDoc);
    createdPackages.push(pkgDoc);

    console.log("  Order " + def.order_id + " (" + def.status + ") — PKR " + totalAmount.toLocaleString() + " — " + items.length + " items");
  }

  // Step 5: Seed BNPL Applications + Offer Letters
  console.log("\n[5] Seeding BNPL applications and offer letters...");
  await BnplApplication.deleteMany({ application_no: /^BNPL-2026-1/ });
  await BnplOfferLetter.deleteMany({ offer_no: /^OFR-2026-1/ });
  for (const app of BNPL_APPLICATIONS) {
    await BnplApplication.create(app);
    console.log("  BNPL app " + app.application_no + " — " + app.status + " — PKR " + app.amount.toLocaleString());
  }
  for (const letter of BNPL_OFFER_LETTERS) {
    await BnplOfferLetter.create(letter);
    console.log("  Offer letter " + letter.offer_no + " — " + letter.status + " — PKR " + letter.total_payable.toLocaleString());
  }

  // Step 6: Seed Reviews
  console.log("\n[6] Seeding product reviews...");
  await Review.deleteMany({ review_id: /^REV-2026-1/ });
  for (const def of ORDER_DEFS) {
    if (!def.has_review) continue;
    const order = createdOrders.find(o => o.order_id === def.order_id);
    if (!order || order.items.length === 0) continue;
    for (const item of order.items) {
      const reviewDoc = {
        review_id: "REV-2026-" + def.order_id.split("-").pop() + item.product_id.slice(-4),
        product_id: item.product_id, order_id: def.order_id,
        buyer_id: def.buyer_id, buyer_name: def.buyer_name,
        seller_id: SELLER_ID, rating: def.review_rating || 4,
        title: def.review_title || "Good product",
        comment: def.review_comment || "Satisfied with the purchase.",
        would_recommend: def.review_rating >= 3.5,
        ai_suggested_rating: round2(def.review_rating + 0.2),
        ai_used: false, ai_generated: false, visible: true,
        created_at: new Date(def.created_at.getTime() + 5*24*60*60*1000),
      };
      await Review.create(reviewDoc);
      console.log("  Review for " + item.product_id.slice(-8) + " — " + def.review_rating + " stars — \"" + def.review_title + "\"");
    }
  }

  // Step 7: Seed Seller Payouts + Admin Wallet Ledger
  console.log("\n[7] Seeding seller payouts and admin wallet transactions...");
  await SellerPayout.deleteMany({ payout_id: /^PAY-2026-1/ });

  let wallet = await AdminWallet.findOne({ wallet_id: "admin_wallet_001" });
  if (!wallet) {
    console.log("  WARNING: Admin wallet not found. Creating with PKR 10M.");
    wallet = await AdminWallet.create({
      wallet_id: "admin_wallet_001", balance: 10_000_000, currency: "PKR",
      ledger: [{ type: "CREDIT", amount: 10_000_000, description: "Initial dummy balance for FYP", at: LAST_MONTH, by_admin_id: "seed" }],
    });
  }

  for (const def of ORDER_DEFS) {
    if (!def.has_payout) continue;
    const order = createdOrders.find(o => o.order_id === def.order_id);
    if (!order) continue;
    const pkg = createdPackages.find(p => p.order_id === def.order_id);
    if (!pkg) continue;
    const payout = computeSellerPayout(order.subtotal, order.shipping_total);

    const payoutDoc = {
      payout_id: "PAY-2026-" + def.order_id.split("-").pop(),
      transaction_id: "TXN-FYP-2026-" + def.order_id.split("-").pop(),
      order_id: def.order_id, package_id: pkg.package_id,
      seller_id: SELLER_ID, seller_name: SELLER_NAME,
      order_amount: order.subtotal, platform_fee: payout.commission,
      shipping_deduction: payout.shipping, net_to_seller: payout.net_to_seller,
      from_account: "WeddingPlatform Admin Account", payout_method: "BANK_TRANSFER",
      released_by: ADMIN_ID, released_at: LAST_WEEK,
      notes: "Payout for completed order " + def.order_id,
    };

    await SellerPayout.create(payoutDoc);
    wallet.balance -= payout.net_to_seller;
    wallet.ledger.push({
      type: "DEBIT", amount: payout.net_to_seller,
      description: "Payout to " + SELLER_NAME + " for order " + def.order_id,
      ref_order_id: def.order_id, ref_payout_id: payoutDoc.payout_id,
      at: LAST_WEEK, by_admin_id: ADMIN_ID,
    });
    wallet.ledger.push({
      type: "CREDIT", amount: order.total_amount,
      description: "Order " + def.order_id + " payment received from buyer " + def.buyer_name,
      ref_order_id: def.order_id,
      at: new Date(def.created_at.getTime() + 1*24*60*60*1000), by_admin_id: "system",
    });
    console.log("  Payout PAY-2026-" + def.order_id.split("-").pop() + " — Net to seller: PKR " + payout.net_to_seller.toLocaleString() + " (5% fee: PKR " + payout.commission.toLocaleString() + ")");
  }

  await wallet.save();
  console.log("  Admin wallet balance: PKR " + wallet.balance.toLocaleString());

  // Step 8: Seed Dispute
  console.log("\n[8] Seeding dispute...");
  await Dispute.deleteMany({ dispute_id: /^DIS-2026-1/ });
  for (const def of ORDER_DEFS) {
    if (!def.has_dispute) continue;
    const order = createdOrders.find(o => o.order_id === def.order_id);
    if (!order) continue;
    const pkg = createdPackages.find(p => p.order_id === def.order_id);
    await Dispute.create({
      dispute_id: "DIS-2026-" + def.order_id.split("-").pop(),
      order_id: def.order_id, package_id: pkg ? pkg.package_id : "",
      buyer_id: def.buyer_id, seller_id: SELLER_ID,
      dispute_type: def.dispute_type || "other",
      title: def.dispute_type === "not_received" ? "Item not received" : "Issue with received item",
      description: def.dispute_desc || "Buyer reported an issue with this order.",
      status: "OPEN",
    });
    console.log("  Dispute DIS-2026-" + def.order_id.split("-").pop() + " — " + def.dispute_type + " — OPEN");
  }

  // Step 9: Seed Notifications
  console.log("\n[9] Seeding notifications...");
  await Notification.deleteMany({ notification_id: /^NTF-2026-1/ });
  const notifications = [];
  for (const def of ORDER_DEFS) {
    const baseId = def.order_id.split("-").pop();
    notifications.push({
      notification_id: "NTF-2026-" + baseId + "01", recipient_id: def.buyer_id, recipient_role: "buyer",
      title: "Order " + def.order_id + " — " + def.status,
      message: "Your order " + def.order_id + " status has been updated to " + def.status + ".",
      type: "order", ref_id: def.order_id, created_at: def.created_at || NOW,
    });
    notifications.push({
      notification_id: "NTF-2026-" + baseId + "02", recipient_id: SELLER_ID, recipient_role: "seller",
      title: "New order activity — " + def.order_id,
      message: "Order " + def.order_id + " from " + def.buyer_name + " is now " + def.status + ".",
      type: "order", ref_id: def.order_id, created_at: def.created_at || NOW,
    });
    notifications.push({
      notification_id: "NTF-2026-" + baseId + "03", recipient_id: "admin", recipient_role: "admin",
      title: "Order " + def.order_id + " — " + def.status,
      message: "Order " + def.order_id + " (" + def.payment_method + ") by " + def.buyer_name + " is " + def.status + ".",
      type: "order", ref_id: def.order_id, created_at: def.created_at || NOW,
    });
    if (def.has_payout) {
      notifications.push({
        notification_id: "NTF-2026-" + baseId + "04", recipient_id: SELLER_ID, recipient_role: "seller",
        title: "Payment released for " + def.order_id,
        message: "PKR has been released to your account for order " + def.order_id + ".",
        type: "payout", ref_id: def.order_id, created_at: LAST_WEEK,
      });
    }
    if (def.has_dispute) {
      notifications.push({
        notification_id: "NTF-2026-" + baseId + "05", recipient_id: "admin", recipient_role: "admin",
        title: "Dispute opened on " + def.order_id,
        message: "Buyer " + def.buyer_name + " opened a dispute (" + def.dispute_type + ") on order " + def.order_id + ".",
        type: "dispute", ref_id: "DIS-2026-" + baseId, created_at: LAST_WEEK,
      });
    }
  }
  for (const n of notifications) {
    await Notification.create(n);
  }
  console.log("  Created " + notifications.length + " notifications.");

  // Step 10: Update Product stock and total_sold
  console.log("\n[10] Updating product stock quantities and total_sold...");
  const productOrderCounts = {};
  for (const order of createdOrders) {
    for (const item of order.items) {
      if (!productOrderCounts[item.product_id]) productOrderCounts[item.product_id] = { count: 0, completed: 0 };
      productOrderCounts[item.product_id].count += item.qty;
      if (order.status === "COMPLETED") productOrderCounts[item.product_id].completed += item.qty;
    }
  }
  for (const [pid, data] of Object.entries(productOrderCounts)) {
    const prod = await Product.findOne({ product_id: pid });
    if (!prod) continue;
    const currentStock = prod.stock_quantity || 5;
    const newStock = Math.max(0, currentStock - data.count);
    const currentSold = prod.total_sold || 0;
    await Product.updateOne({ product_id: pid }, {
      $set: { stock_quantity: newStock, total_sold: currentSold + data.completed, is_available: newStock > 0,
        is_best_seller: (currentSold + data.completed) >= 3,
        is_hot_deal: prod.discount_price && prod.discount_price < (prod.price_pkr || prod.price || 25000) * 0.85 },
    });
    console.log("  Product " + pid.slice(-8) + " — stock: " + currentStock + " -> " + newStock + ", sold: " + (currentSold + data.completed));
  }

  // Report
  console.log("\n" + "=".repeat(70));
  console.log("  SEED V2 COMPLETE!");
  console.log("=".repeat(70));

  const counts = {
    buyers: await Buyer.countDocuments(), orders: await Order.countDocuments(),
    packages: await Package.countDocuments(), bnpl_apps: await BnplApplication.countDocuments(),
    offer_letters: await BnplOfferLetter.countDocuments(), reviews: await Review.countDocuments(),
    payouts: await SellerPayout.countDocuments(), disputes: await Dispute.countDocuments(),
    notifications: await Notification.countDocuments(), products: await Product.countDocuments(),
    dowry_est: await DowryEstimation.countDocuments(),
  };
  console.log("\n  Collection Counts:");
  for (const [col, cnt] of Object.entries(counts)) { console.log("    " + col + ": " + cnt); }

  console.log("\n  Login Credentials:");
  console.log("    Admin:   admin@shaadisahulat.com  /  Admin@1234");
  console.log("    Seller:  ahmed@shaadisahulat.com  /  Test@1234");
  console.log("    Buyer 1: aisha@example.com        /  Buyer@1234");
  console.log("    Buyer 2: usman@example.com        /  Buyer@1234");
  console.log("    Buyer 3: fatima@example.com       /  Buyer@1234");
  console.log("    Bank:   officer@bank.com          /  bank123");

  console.log("\n  Order Lifecycle Coverage:");
  const statuses = ["PENDING_BNPL_APPROVAL","CONFIRMED","PREPARING","SHIPPED","DELIVERED","DISPUTED","CANCELLED","COMPLETED"];
  for (const s of statuses) { console.log("    " + s + ": " + (await Order.countDocuments({status: s})) + " order(s)"); }

  console.log("\n  Product Flow Demonstrated:");
  console.log("    Seller -> Upload -> Category -> Admin -> Marketplace ->");
  console.log("    Buyer -> Cart -> Checkout -> Order -> BNPL (optional) ->");
  console.log("    Shipping -> Confirmed/Rejected -> Review -> Budget Update ->");
  console.log("    Dashboard Update -> Admin Payout -> Seller Amount -> Dashboard");

  console.log("\n  IMPORTANT: After this seed, all data is DYNAMIC.");
  console.log("  New orders, reviews, and payouts work on top of this data.");

  await mongoose.disconnect();
  console.log("\nDone.\n");
}

function buildTimeline(status, createdAt) {
  const timeline = [];
  const d = new Date(createdAt);
  timeline.push({ status: "CONFIRMED", at: d, by: "system", note: "Order created" });
  if (status === "PENDING_BNPL_APPROVAL") return timeline;
  if (["PREPARING","SHIPPED","DELIVERED","COMPLETED","DISPUTED","CANCELLED"].includes(status)) {
    timeline.push({ status: "PREPARING", at: new Date(d.getTime()+1*24*60*60*1000), by: "seller", by_id: SELLER_ID, note: "Seller started preparing" });
  }
  if (["SHIPPED","DELIVERED","COMPLETED","DISPUTED"].includes(status)) {
    timeline.push({ status: "SHIPPED", at: new Date(d.getTime()+2*24*60*60*1000), by: "seller", by_id: SELLER_ID, note: "Shipped via TCS Express" });
  }
  if (["DELIVERED","COMPLETED","DISPUTED"].includes(status)) {
    timeline.push({ status: "DELIVERED", at: new Date(d.getTime()+4*24*60*60*1000), by: "seller", by_id: SELLER_ID, note: "Delivered to buyer" });
  }
  if (status === "COMPLETED") {
    timeline.push({ status: "COMPLETED", at: new Date(d.getTime()+5*24*60*60*1000), by: "admin", by_id: ADMIN_ID, note: "Payment released to seller" });
  }
  if (status === "DISPUTED") {
    timeline.push({ status: "DISPUTED", at: new Date(d.getTime()+5*24*60*60*1000), by: "buyer", note: "Buyer raised dispute" });
  }
  if (status === "CANCELLED") {
    timeline.push({ status: "CANCELLED", at: new Date(d.getTime()+6*24*60*60*1000), by: "admin", by_id: ADMIN_ID, note: "Admin cancelled order" });
  }
  return timeline;
}

function mapOrderStatusToPackageStatus(orderStatus) {
  const map = { "PENDING_BNPL_APPROVAL":"PENDING","CONFIRMED":"PENDING","PREPARING":"PREPARING","SHIPPED":"SHIPPED","DELIVERED":"DELIVERED","COMPLETED":"COMPLETED","DISPUTED":"DISPUTED","RESOLVED":"RESOLVED","CANCELLED":"CANCELLED" };
  return map[orderStatus] || "PENDING";
}

main().catch(err => { console.error("[seedV2] Error:", err.message); process.exit(1); });
