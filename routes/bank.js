/**
 * Bank officer API routes (BNPL&Delivery.md Steps 6 & 7).
 *
 * Mounted at /api/bank in server.js.
 *
 * Endpoints (require bank officer token via x-officer-token header):
 *   POST /login                                       officer login (returns token)
 *   GET  /applications                                list applications (filter by status)
 *   GET  /applications/:application_no                full application detail (Step 6A)
 *   GET  /applications/:application_no/document/:doc_id  serve raw file from disk
 *   POST /applications/:application_no/decision       Step 6C + 7 — APPROVE / REJECT
 *
 * The bank officer's verification checklist (Step 6B) is collapsed to a
 * single APPROVE/REJECT decision per spec: "The Banker Only Selects
 * Approved (Passed) or not approved".
 *
 * On APPROVE: offer letter generated with 3-day validity + installment schedule.
 * On REJECT:  reason recorded; order → CANCELLED.
 *
 * For the FYP demo there is a single bank officer account that can see ALL
 * banks' applications. Its credentials come from the environment
 * (BANK_OFFICER_EMAIL + BANK_OFFICER_PASSWORD_HASH, a bcrypt hash — see
 * scripts/hash-bank-officer-password.js); nothing is hardcoded. A real production
 * system would have a BnplBankOfficer collection with per-bank credentials.
 */
const express = require("express");
const fs = require("fs");
const router = express.Router();

const bcrypt = require("bcryptjs");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

const BnplBank = require("../models/BnplBank");
const BnplUser = require("../models/BnplUser");
const BnplApplication = require("../models/BnplApplication");
const BnplDocument = require("../models/BnplDocument");
const BnplOfferLetter = require("../models/BnplOfferLetter");
const Order = require("../models/Order");
const Buyer = require("../models/Buyer");

const { requireBankOfficer, issueOfficerToken } = require("../lib/auth");
const { decrypt, maskCnic, maskIban } = require("../lib/crypto");
const { signPrivateFileUrl, sendPrivateFile } = require("../lib/privateFiles");
const {
  computePlan,
  buildInstallmentSchedule,
  offerExpiry,
  generateOfferNo,
} = require("../lib/helpers");
const { notifyBuyerAndAdmin } = require("../lib/notify");
const { finalizeBnplApproval } = require("../lib/bnplFulfillment");
const BnplDocumentBundle = require("../models/BnplDocumentBundle");

// ---------- Bank officer login (credentials from the environment) ----------
const BCRYPT_HASH_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
// Compared when the email is wrong or login is not configured, so every failure
// costs one bcrypt check (no timing difference between "unknown email" and "bad password").
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

function officerConfig() {
  const email = String(process.env.BANK_OFFICER_EMAIL || "").trim().toLowerCase();
  const hash = String(process.env.BANK_OFFICER_PASSWORD_HASH || "").trim();
  return email && BCRYPT_HASH_RE.test(hash) ? { email, hash } : null;
}

const bankLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req) =>
    `${ipKeyGenerator(req.ip || "")}|${String(req.body?.email || "").trim().toLowerCase().slice(0, 254)}`,
  message: { success: false, code: "RATE_LIMITED", error: "Too many attempts. Please try again later." },
});

router.post("/login", bankLoginLimiter, async (req, res) => {
  const { email, password } = req.body || {};
  const cfg = officerConfig();
  const emailOk = Boolean(cfg) && typeof email === "string" && email.trim().toLowerCase() === cfg.email;
  const passwordOk = await bcrypt.compare(
    typeof password === "string" ? password.slice(0, 200) : "",
    emailOk ? cfg.hash : DUMMY_HASH
  );
  if (!cfg) {
    return res.status(503).json({ success: false, error: "Bank officer login is not configured." });
  }
  if (!emailOk || !passwordOk) {
    return res.status(401).json({ success: false, error: "Invalid bank officer credentials" });
  }
  const officer = {
    officer_id: "bank_officer_001",
    bank_id: "*",
    name: "Bank Officer",
  };
  const token = issueOfficerToken(officer);
  return res.json({ success: true, token, officer, email: cfg.email });
});

// ---------- List applications ----------
router.get("/applications", requireBankOfficer, async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    // Period filter: "24h" or "7d"
    const period = req.query.period;
    if (period === "24h") {
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      filter.created_at = { $gte: yesterday };
    } else if (period === "7d") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      filter.created_at = { $gte: weekAgo };
    }

    const apps = await BnplApplication.find(filter).sort({ created_at: -1 }).lean();
    const bankIds = [...new Set(apps.map(a => a.bank_id))];
    const banks = await BnplBank.find({ bank_id: { $in: bankIds } }).lean();
    const bankMap = Object.fromEntries(banks.map(b => [b.bank_id, b]));

    const buyerIds = [...new Set(apps.map(a => a.buyer_id))];
    const buyers = await Buyer.find({ buyer_id: { $in: buyerIds } }).lean();
    const buyerMap = Object.fromEntries(buyers.map(b => [b.buyer_id, b]));

    const bnplUsers = await BnplUser.find({ buyer_id: { $in: buyerIds } }).lean();
    const bnplUserMap = Object.fromEntries(bnplUsers.map(u => [u.buyer_id, u]));

    const rows = apps.map(a => {
      const bank = bankMap[a.bank_id] || {};
      const buyer = buyerMap[a.buyer_id] || {};
      const bnplUser = bnplUserMap[a.buyer_id] || {};
      const cnicPlain = bnplUser.cnic_enc ? decrypt(bnplUser.cnic_enc) : null;
      return {
        application_no: a.application_no,
        order_id: a.order_id,
        buyer_id: a.buyer_id,
        buyer_name: buyer.name || bnplUser.full_name || "",
        buyer_email: buyer.email || "",
        buyer_phone: buyer.phone || bnplUser.phone || "",
        cnic_masked: cnicPlain ? maskCnic(cnicPlain) : null,
        bank_code: bank.code || "",
        bank_name: bank.name || "",
        amount: a.amount,
        plan_months: a.plan_months,
        status: a.status,
        created_at: a.created_at,
        decision_at: a.decision_at,
      };
    });

    // Today's stats (kept for the "Today" filter card on the UI)
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // ── All-time totals (per Big-Task-Batch2 §Banker #2) ───────────────
    // Stat cards on the dashboard now show all-time totals for each
    // status, not just today's activity.
    const stats = {
      // All-time counts — what the UI cards actually display
      total:        await BnplApplication.countDocuments({}),
      pending:      await BnplApplication.countDocuments({ status: "PENDING_BANK_VERIFICATION" }),
      approved:     await BnplApplication.countDocuments({ status: "APPROVED" }),
      rejected:     await BnplApplication.countDocuments({ status: "REJECTED" }),
      offer_accepted: await BnplApplication.countDocuments({ status: "OFFER_ACCEPTED" }),
      cancelled:    await BnplApplication.countDocuments({ status: "CANCELLED" }),
      // Today breakdown (kept for the optional "Today" filter chip)
      completed_today: await BnplApplication.countDocuments({
        decision_at: { $gte: startOfDay },
        status: { $in: ["APPROVED", "REJECTED"] },
      }),
      approved_today: await BnplApplication.countDocuments({
        decision_at: { $gte: startOfDay },
        status: "APPROVED",
      }),
      rejected_today: await BnplApplication.countDocuments({
        decision_at: { $gte: startOfDay },
        status: "REJECTED",
      }),
    };

    // Group by buyer_id
    const groupsMap = {};
    for (const row of rows) {
      if (!groupsMap[row.buyer_id]) {
        groupsMap[row.buyer_id] = { buyer_id: row.buyer_id, buyer_name: row.buyer_name, applications: [] };
      }
      groupsMap[row.buyer_id].applications.push(row);
    }
    const groups = Object.values(groupsMap);

    return res.json({ success: true, applications: rows, groups, stats });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Application detail (Step 6A) ----------
router.get("/applications/:application_no", requireBankOfficer, async (req, res) => {
  try {
    const app = await BnplApplication.findOne({
      application_no: req.params.application_no,
    }).lean();
    if (!app) return res.status(404).json({ success: false, error: "Application not found" });

    const [bank, buyer, bnplUser, order, offer, docs] = await Promise.all([
      BnplBank.findOne({ bank_id: app.bank_id }).lean(),
      Buyer.findOne({ buyer_id: app.buyer_id }).lean(),
      BnplUser.findOne({ buyer_id: app.buyer_id }).lean(),
      Order.findOne({ order_id: app.order_id }).lean(),
      BnplOfferLetter.findOne({ application_id: app.application_no }).lean(),
      BnplDocument.find({ application_id: app.application_no }).lean(),
    ]);

    const ibanPlain = app.iban_enc ? decrypt(app.iban_enc) : null;
    const buyerCnicPlain = bnplUser && bnplUser.cnic_enc ? decrypt(bnplUser.cnic_enc) : null;

    const cnicFrontDoc = docs.find(d => d.doc_type === "cnic_front");
    const ocrCnic = cnicFrontDoc && cnicFrontDoc.ocr_extracted_cnic ? cnicFrontDoc.ocr_extracted_cnic : null;
    const mismatch = buyerCnicPlain && ocrCnic && buyerCnicPlain !== ocrCnic;

    return res.json({
      success: true,
      application_no: app.application_no,
      status: app.status,
      plan_months: app.plan_months,
      amount: app.amount,
      // risk_score and risk_category excluded from API responses (v3.2)
      officer_comment: app.officer_comment,
      decision_at: app.decision_at,
      offer_expires_at: app.offer_expires_at,
      created_at: app.created_at,
      verification_checks: app.verification_checks || { cnic_match: false, iban_valid: false, identity_confirmed: false, documents_complete: false },
      countdown_remaining_ms: app.status === "APPROVED" && app.offer_expires_at
        ? Math.max(0, new Date(app.offer_expires_at).getTime() - Date.now())
        : null,
      buyer: {
        buyer_id: app.buyer_id,
        name: buyer ? buyer.name : bnplUser ? bnplUser.full_name : "",
        email: buyer ? buyer.email : "",
        phone: buyer ? buyer.phone : bnplUser ? bnplUser.phone : "",
        address: bnplUser ? bnplUser.address : order ? `${order.shipping_address.line1}, ${order.shipping_address.city}` : "",
        cnic_masked: buyerCnicPlain ? maskCnic(buyerCnicPlain) : null,
        cnic_plain: buyerCnicPlain, // officer may see plaintext
      },
      bank: bank
        ? { bank_id: bank.bank_id, code: bank.code, name: bank.name }
        : null,
      iban_plain: ibanPlain,
      iban_masked: ibanPlain ? maskIban(ibanPlain) : null,
      account_title: app.account_title,
      order: order
        ? {
            order_id: order.order_id,
            total_amount: order.total_amount,
            shipping_address: order.shipping_address,
            items: order.items,
          }
        : null,
      documents: docs.map(d => ({
        _id: d._id,
        doc_type: d.doc_type,
        original_name: d.original_name,
        mime_type: d.mime_type,
        url: signPrivateFileUrl(d.file_path),
        ocr_extracted_cnic: d.ocr_extracted_cnic,
        ocr_confidence: d.ocr_confidence,
        ocr_completed_at: d.ocr_completed_at,
        ocr_raw_text: d.ocr_raw_text,
        ocr_error: d.ocr_error || null,
      })),
      ocr_vs_buyer: {
        buyer_entered_cnic: buyerCnicPlain,
        ocr_extracted_cnic: ocrCnic,
        mismatch: !!mismatch,
        note: mismatch
          ? "WARNING: CNIC from the uploaded card does NOT match the buyer profile CNIC."
          : "CNIC values match.",
      },
      offer: offer
        ? {
            offer_no: offer.offer_no,
            approved_amount: offer.approved_amount,
            plan_months: offer.plan_months,
            processing_fee: offer.processing_fee,
            monthly_installment: offer.monthly_installment,
            total_payable: offer.total_payable,
            valid_until: offer.valid_until,
            accepted_at: offer.accepted_at,
            status: offer.status,
            installments: offer.installments || [],
          }
        : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Serve raw document file (by Mongo _id OR doc_type) ----------
router.get(
  "/applications/:application_no/document/:doc_id",
  requireBankOfficer,
  async (req, res) => {
    try {
      const key = req.params.doc_id;
      let filePath = "";

      // Lookup order: document by doc_type, then by Mongo _id, then the document bundle slot.
      let doc = await BnplDocument.findOne({
        application_id: req.params.application_no,
        doc_type: key,
      }).lean();
      if (!doc && /^[a-fA-F0-9]{24}$/.test(key)) {
        doc = await BnplDocument.findOne({
          application_id: req.params.application_no,
          _id: key,
        }).lean();
      }
      if (doc) {
        filePath = doc.file_path || "";
      } else if (["cnic_front", "cnic_back", "utility_bill"].includes(key)) {
        const bundle = await BnplDocumentBundle.findOne({
          application_id: req.params.application_no,
        }).lean();
        filePath = bundle?.[key]?.file_path || "";
      }
      if (!filePath) return res.status(404).json({ success: false, error: "Document not found" });

      // Streamed through Node: the storage location (disk path / Cloudinary URL) is never revealed.
      return await sendPrivateFile(res, filePath);
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ---------- Decision (Step 6C + 7) ----------
router.post(
  "/applications/:application_no/decision",
  requireBankOfficer,
  async (req, res) => {
    try {
      const { decision, reason, plan_months, comment } = req.body || {};
      // risk_score and risk_category removed from accepted body fields (v3.2)

      if (!["APPROVE", "REJECT"].includes(decision)) {
        return res.status(400).json({ success: false, error: "decision must be APPROVE or REJECT" });
      }

      const app = await BnplApplication.findOne({
        application_no: req.params.application_no,
      });
      if (!app) return res.status(404).json({ success: false, error: "Application not found" });
      if (app.status !== "PENDING_BANK_VERIFICATION") {
        return res.status(400).json({
          success: false,
          error: `Application is in status ${app.status}, cannot decide.`,
        });
      }

      // ── Persist verification_checks sent with the decision (Big-Task-Batch2 §Banker #1) ──
      // ROOT-CAUSE FIX: previously the frontend sent the checkbox state inside
      // the decision POST but the backend never read it — it only checked
      // `app.verification_checks` (which was always all-false).  Now we
      // accept `verification_checks` in the body and persist it BEFORE
      // running the gate check below.
      //
      // The frontend uses 2 check boxes:
      //   cnic_approved      → maps to cnic_match + identity_confirmed
      //   bank_verified      → maps to iban_valid + documents_complete
      // Either form is accepted here.
      if (decision === "APPROVE" && req.body.verification_checks) {
        const incoming = req.body.verification_checks || {};
        if (!app.verification_checks) app.verification_checks = {
          cnic_match: false, iban_valid: false,
          identity_confirmed: false, documents_complete: false,
        };
        // Accept either the canonical 4-field names OR the frontend's
        // 2-checkbox aliases (cnic_approved, bank_verified).
        if (typeof incoming.cnic_match === "boolean")
          app.verification_checks.cnic_match = incoming.cnic_match;
        if (typeof incoming.iban_valid === "boolean")
          app.verification_checks.iban_valid = incoming.iban_valid;
        if (typeof incoming.identity_confirmed === "boolean")
          app.verification_checks.identity_confirmed = incoming.identity_confirmed;
        if (typeof incoming.documents_complete === "boolean")
          app.verification_checks.documents_complete = incoming.documents_complete;
        if (typeof incoming.cnic_approved === "boolean") {
          app.verification_checks.cnic_match         = incoming.cnic_approved;
          app.verification_checks.identity_confirmed = incoming.cnic_approved;
        }
        if (typeof incoming.bank_verified === "boolean") {
          app.verification_checks.iban_valid          = incoming.bank_verified;
          app.verification_checks.documents_complete = incoming.bank_verified;
        }
        app.markModified("verification_checks");
        await app.save();
      }

      const plan = decision === "APPROVE" ? parseInt(plan_months || app.plan_months, 10) : null;
      if (decision === "APPROVE" && ![3, 6].includes(plan)) {
        return res.status(400).json({ success: false, error: "plan_months must be 3 or 6 on approval" });
      }

      // Before APPROVE, check that all verification_checks are true
      if (decision === "APPROVE") {
        const checks = app.verification_checks || {};
        const allChecksPassed = checks.cnic_match && checks.iban_valid && checks.identity_confirmed && checks.documents_complete;
        if (!allChecksPassed) {
          return res.status(400).json({
            success: false,
            error: "All verification checks must pass before approval (cnic_match, iban_valid, identity_confirmed, documents_complete)",
            verification_checks: checks,
          });
        }
      }

      if (decision === "APPROVE") {
        // Approval finalizes BNPL immediately (no buyer offer-accept step).
        // Creates packages so sellers see the order; payment_status stays PENDING
        // until admin releases funds to the seller.
        await finalizeBnplApproval({
          applicationNo: app.application_no,
          planMonths: plan,
          comment: comment || "Approved by bank officer.",
          by: "bank",
          byId: req.officer.officer_id,
        });

        await notifyBuyerAndAdmin({
          buyer_id: app.buyer_id,
          title: "BNPL Application APPROVED",
          message: `Your BNPL application ${app.application_no} has been APPROVED. Your order is confirmed and sellers will fulfill it.`,
          type: "bnpl",
          ref_id: app.application_no,
        });
      } else {
        app.status = "REJECTED";
        app.officer_comment = reason || "Rejected by bank officer.";
        app.decision_at = new Date();
        await app.save();

        // Order → CANCELLED with explicit "Rejected" timeline event
        // (per Big-Task-Batch2 §5.3 — Banker cancels/rejects BNPL: reflect
        // "Rejected" in red in the order's status timeline, close the order,
        // and log the event in the Admin activity log.)
        await Order.updateOne(
          { order_id: app.order_id },
          {
            $set: { status: "CANCELLED", payment_status: "CANCELLED" },
            $push: {
              timeline: {
                status: "REJECTED",
                at: new Date(),
                by: "bank",
                by_id: req.officer.officer_id,
                note: `BNPL application ${app.application_no} REJECTED by bank officer. Reason: ${reason || "N/A"}. Order closed.`,
              },
            },
          }
        );

        // Return reserved inventory from the cancelled BNPL sale
        try {
          const cancelledOrder = await Order.findOne({ order_id: app.order_id }).lean();
          if (cancelledOrder?.items?.length) {
            const { restoreStockForOrderItems } = require("../lib/inventory");
            await restoreStockForOrderItems(cancelledOrder.items);
          }
        } catch (invErr) {
          console.warn("[bank] stock restore on BNPL reject failed:", invErr.message);
        }

        // Log to admin activity log via notification
        const Notification = require("../models/Notification");
        await Notification.create([{
          notification_id: `N-${Date.now()}`,
          user_id: "admin",
          user_role: "admin",
          title: "BNPL Application Rejected",
          message: `Bank officer rejected BNPL application ${app.application_no} for order ${app.order_id}. Reason: ${reason || "N/A"}.`,
          type: "bnpl",
          ref_id: app.application_no,
        }]).catch(() => {});

        await notifyBuyerAndAdmin({
          buyer_id: app.buyer_id,
          title: "BNPL Application REJECTED",
          message: `Your BNPL application ${app.application_no} was rejected. Reason: ${reason || "N/A"}. Order ${app.order_id} has been cancelled.`,
          type: "bnpl",
          ref_id: app.application_no,
        });
      }

      return res.json({
        success: true,
        message:
          decision === "APPROVE"
            ? "Application approved. BNPL finalized and order released for fulfillment."
            : "Application rejected. Order cancelled.",
        application_no: app.application_no,
        status: app.status,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ---------- Verify-check endpoint: mark individual verification checks ----------
router.post(
  "/applications/:application_no/verify-check",
  requireBankOfficer,
  async (req, res) => {
    try {
      const { check_name, value } = req.body || {};
      const allowedChecks = ["cnic_match", "iban_valid", "identity_confirmed", "documents_complete"];
      if (!allowedChecks.includes(check_name)) {
        return res.status(400).json({ success: false, error: `check_name must be one of: ${allowedChecks.join(", ")}` });
      }
      if (typeof value !== "boolean") {
        return res.status(400).json({ success: false, error: "value must be true or false" });
      }

      const app = await BnplApplication.findOne({
        application_no: req.params.application_no,
      });
      if (!app) return res.status(404).json({ success: false, error: "Application not found" });

      if (!app.verification_checks) app.verification_checks = {};
      app.verification_checks[check_name] = value;
      app.markModified("verification_checks");
      await app.save();

      return res.json({
        success: true,
        application_no: app.application_no,
        verification_checks: app.verification_checks,
      });
    } catch (err) {
      return res.status(500).json({ success: false, error: err.message });
    }
  }
);

// ---------- Banker Batch Releases ----------
const BnplBatchRelease = require("../models/BnplBatchRelease");
const { runBnplBatchRelease } = require("../services/bnplBatchService");

// GET /api/bank/batches — list of batch releases from bank to admin + all approved BNPL orders
router.get("/batches", requireBankOfficer, async (req, res) => {
  try {
    const batches = await BnplBatchRelease.find().sort({ released_at: -1 }).lean();
    const totalReleased = batches.reduce((sum, b) => sum + (b.total_amount || 0), 0);
    const totalOrders = batches.reduce((sum, b) => sum + (b.order_count || 0), 0);

    // Find all BNPL applications that are APPROVED, OFFER_ACCEPTED, or already batched
    const apps = await BnplApplication.find({
      $or: [
        { status: { $in: ["APPROVED", "OFFER_ACCEPTED"] } },
        { batch_id: { $exists: true, $nin: [null, ""] } },
      ],
    })
      .sort({ created_at: -1 })
      .lean();

    const orderIds = apps.map((a) => a.order_id).filter(Boolean);
    const buyerIds = apps.map((a) => a.buyer_id).filter(Boolean);

    const [orders, buyers] = await Promise.all([
      Order.find({ order_id: { $in: orderIds } }).lean(),
      Buyer.find({ buyer_id: { $in: buyerIds } }).lean(),
    ]);

    const orderMap = Object.fromEntries(orders.map((o) => [o.order_id, o]));
    const buyerMap = Object.fromEntries(buyers.map((b) => [b.buyer_id, b.name]));

    const approved_orders = apps.map((a) => {
      const ord = orderMap[a.order_id];
      const isBatched = Boolean(a.batch_id);
      return {
        application_no: a.application_no,
        order_id: a.order_id,
        buyer_id: a.buyer_id,
        buyer_name: ord?.buyer_name || buyerMap[a.buyer_id] || "Customer",
        amount: ord?.total_amount || a.amount || 0,
        plan_months: a.plan_months,
        status: a.status,
        batch_id: a.batch_id || null,
        is_transferred: isBatched,
        created_at: a.created_at,
        decision_at: a.decision_at || a.updatedAt || a.created_at,
      };
    });

    return res.json({
      success: true,
      count: batches.length,
      total_amount_released: totalReleased,
      total_orders_batched: totalOrders,
      batches,
      approved_orders,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bank/trigger-batch — manually execute batch release
router.post("/trigger-batch", requireBankOfficer, async (req, res) => {
  try {
    const result = await runBnplBatchRelease();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ── BNPL Repayments (installment tracking) ──────────────────────────────────
const {
  listRepayments,
  getRepaymentDetail,
  recordPayment,
} = require("../lib/bnplRepayment");

// GET /api/bank/repayments — summary + list for banker
router.get("/repayments", requireBankOfficer, async (req, res) => {
  try {
    const data = await listRepayments({});
    return res.json({ success: true, ...data });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/bank/repayments/:application_no
router.get("/repayments/:application_no", requireBankOfficer, async (req, res) => {
  try {
    const detail = await getRepaymentDetail(req.params.application_no);
    if (!detail) return res.status(404).json({ success: false, error: "Repayment not found" });
    return res.json({ success: true, repayment: detail });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/bank/repayments/:application_no/payments — record a repayment
router.post("/repayments/:application_no/payments", requireBankOfficer, async (req, res) => {
  try {
    const { amount, paid_at, note } = req.body || {};
    const repayment = await recordPayment(req.params.application_no, {
      amount,
      paid_at,
      note,
      recorded_by: req.officer?.officer_id || req.officer?.name || "bank_officer",
      recorded_by_role: "bank",
    });
    return res.json({ success: true, message: "Payment recorded", repayment });
  } catch (err) {
    return res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
