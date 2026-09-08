/**
 * BNPL buyer-facing API routes.
 *
 * Mounted at /api/bnpl in server.js.
 *
 * Endpoints (all require buyer auth unless noted):
 *   GET  /eligibility?amount=...                Step 2 — pre-check
 *   GET  /banks                                  Step 2 — list partner banks
 *   GET  /profile                                buyer's BNPL profile (masked)
 *   POST /applications                           Step 3 — submit application (multipart)
 *   GET  /applications                           list buyer's applications
 *   GET  /applications/:application_no           Step 4 — application status
 *   POST /applications/:application_no/accept-offer   Step 7 — accept offer
 *   POST /applications/:application_no/decline-offer Step 7 — decline offer
 *
 * Step 5 (platform → dummy bank) is implicit: the application row IS the
 * payload the bank officer sees in the dashboard.
 */
const express = require("express");
const path = require("path");
const router = express.Router();

const Buyer = require("../models/Buyer");
const BnplBank = require("../models/BnplBank");
const BnplUser = require("../models/BnplUser");
const BnplApplication = require("../models/BnplApplication");
const BnplDocument = require("../models/BnplDocument");
const BnplDocumentBundle = require("../models/BnplDocumentBundle");
const BnplOfferLetter = require("../models/BnplOfferLetter");
const Order = require("../models/Order");
const Notification = require("../models/Notification");

const { requireBuyer } = require("../lib/auth");
const { encrypt, decrypt, maskCnic, maskIban } = require("../lib/crypto");
const { saveBnplUploadAsync, resolvePath, publicUrl, makeBnplUploadMiddleware, materializeLocal } = require("../lib/storage");
const { runOcrPipeline } = require("../lib/ocr");
const { checkBnplEligibility } = require("../lib/eligibility");
const {
  generateApplicationNo,
  generateOfferNo,
  computePlan,
  buildInstallmentSchedule,
  offerExpiry,
  validateIban,
} = require("../lib/helpers");
const { pushNotification, notifyBuyerAndAdmin } = require("../lib/notify");

const upload = makeBnplUploadMiddleware();

// ---------- Step 2: eligibility ----------
router.get("/eligibility", requireBuyer, async (req, res) => {
  try {
    const amount = parseFloat(req.query.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: "amount query param required" });
    }
    const result = await checkBnplEligibility(req.user.id, amount);
    return res.json({ success: true, amount, ...result });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 2: list banks ----------
router.get("/banks", async (req, res) => {
  try {
    const banks = await BnplBank.find({ active: true }).lean();
    return res.json({
      success: true,
      banks: banks.map(b => ({
        bank_id: b.bank_id,
        code: b.code,
        name: b.name,
        iban_prefix: b.iban_prefix,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 2: buyer's BNPL profile (masked) ----------
router.get("/profile", requireBuyer, async (req, res) => {
  try {
    const profile = await BnplUser.findOne({ buyer_id: req.user.id }).lean();
    if (!profile) return res.json({ success: true, has_profile: false });
    const cnicPlain = profile.cnic_enc ? decrypt(profile.cnic_enc) : null;
    return res.json({
      success: true,
      has_profile: true,
      full_name: profile.full_name,
      phone: profile.phone,
      cnic_masked: cnicPlain ? maskCnic(cnicPlain) : null,
      address: profile.address,
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 3: submit application ----------
router.post("/applications", requireBuyer, upload, async (req, res) => {
  try {
    const {
      order_id,
      bank_id,
      iban,
      account_title: accountTitle,
      plan_months: planMonths,
      confirm,
      cnic_number: buyerCnic, // optional — buyer may pre-fill CNIC; if absent, we trust OCR
    } = req.body;

    const files = req.files || {};

    // --- validate required fields ---
    if (!order_id || !bank_id || !iban || !accountTitle || !planMonths) {
      return res.status(400).json({ success: false, error: "Missing required fields: order_id, bank_id, iban, account_title, plan_months" });
    }
    if (!validateIban(iban)) {
      return res.status(400).json({ success: false, error: "IBAN must start with PK and be 24 chars (PK + 22 alphanumeric)" });
    }
    const plan = parseInt(planMonths, 10);
    if (![3, 6].includes(plan)) {
      return res.status(400).json({ success: false, error: "plan_months must be 3 or 6" });
    }
    if (confirm !== "true" && confirm !== "1") {
      return res.status(400).json({ success: false, error: "You must confirm the information is correct (confirm=true)" });
    }
    if (!files.cnic_front || !files.cnic_back || !files.utility_bill) {
      return res.status(400).json({ success: false, error: "cnic_front, cnic_back, and utility_bill files are all required" });
    }

    // --- load order + bank ---
    const order = await Order.findOne({ order_id, buyer_id: req.user.id }).lean();
    if (!order) return res.status(404).json({ success: false, error: "Order not found for this buyer" });

    const bank = await BnplBank.findOne({ bank_id, active: true }).lean();
    if (!bank) return res.status(400).json({ success: false, error: "Invalid or inactive bank" });

    const ibanUpper = iban.toUpperCase();
    // Prefix validation removed for testing.
    // if (!ibanUpper.startsWith(bank.iban_prefix)) {
    //   return res.status(400).json({
    //     success: false,
    //     error: `IBAN prefix does not match ${bank.name}. Expected prefix: ${bank.iban_prefix}`,
    //   });
    // }

    // --- eligibility ---
    const elig = await checkBnplEligibility(req.user.id, order.total_amount);
    if (!elig.eligible) {
      return res.status(403).json({ success: false, error: elig.reasons.join(" ") });
    }

    // --- fetch buyer for name/email ---
    const buyer = await Buyer.findOne({ buyer_id: req.user.id }).lean();

    // --- create application row ---
    const applicationNo = generateApplicationNo();
    const application = await BnplApplication.create({
      application_no: applicationNo,
      buyer_id: req.user.id,
      order_id: order.order_id,
      bank_id: bank.bank_id,
      iban_enc: encrypt(ibanUpper),
      account_title: accountTitle,
      plan_months: plan,
      amount: order.total_amount,
      status: elig.auto_approve ? "APPROVED" : "PENDING_BANK_VERIFICATION",
      risk_score: elig.auto_approve ? 100 : null,
      risk_category: elig.auto_approve ? "LOW RISK" : null,
      officer_comment: elig.auto_approve
        ? "Auto-approved: prior verified documents on file, amount below PKR 50,000 threshold."
        : "",
      decision_at: elig.auto_approve ? new Date() : null,
      offer_expires_at: elig.auto_approve ? offerExpiry() : null,
    });

    // --- persist uploaded files + run OCR ---
    const fileSpecs = [
      { type: "cnic_front",   field: "cnic_front",   name: "cnic_front" },
      { type: "cnic_back",    field: "cnic_back",    name: "cnic_back" },
      { type: "utility_bill", field: "utility_bill", name: "utility_bill" },
    ];
    const docIds = {};
    const bundleData = {
      application_id: applicationNo,
      buyer_id: req.user.id,
      cnic_front: {},
      cnic_back: {},
      utility_bill: {},
    };

    for (const spec of fileSpecs) {
      const f = files[spec.field][0];
      const ext = path.extname(f.originalname) || (f.mimetype === "application/pdf" ? ".pdf" : ".jpg");
      const relPath = await saveBnplUploadAsync(req.user.id, applicationNo, spec.name + ext, f.buffer);
      
      const doc = await BnplDocument.create({
        application_id: applicationNo,
        buyer_id: req.user.id,
        doc_type: spec.type,
        file_path: relPath,
        original_name: f.originalname,
        mime_type: f.mimetype,
        ocr_raw_text: "",
        ocr_extracted_cnic: "",
        ocr_confidence: 0,
        ocr_completed_at: null,
      });
      docIds[spec.type] = doc._id;

      bundleData[spec.type] = {
        file_path: relPath,
        original_name: f.originalname,
        mime_type: f.mimetype,
      };
    }

    // Run OCR on CNIC front (best-effort, never crash the request)
    let ocrCnic = null;
    let ocrConfidence = 0;
    try {
      const cnicFrontDoc = await BnplDocument.findById(docIds.cnic_front);
      const absPath = await materializeLocal(cnicFrontDoc.file_path);
      const ocr = await runOcrPipeline(absPath, cnicFrontDoc.mime_type);
      ocrCnic = ocr.extracted_cnic;
      ocrConfidence = ocr.confidence;
      cnicFrontDoc.ocr_raw_text = ocr.raw_text || "";
      cnicFrontDoc.ocr_extracted_cnic = ocr.extracted_cnic || "";
      cnicFrontDoc.ocr_confidence = ocr.confidence || 0;
      cnicFrontDoc.ocr_completed_at = new Date();
      cnicFrontDoc.ocr_error = ocr.ocr_error || "";
      await cnicFrontDoc.save();

      bundleData.cnic_front.ocr_raw_text = ocr.raw_text || "";
      bundleData.cnic_front.ocr_extracted_cnic = ocr.extracted_cnic || "";
      bundleData.cnic_front.ocr_confidence = ocr.confidence || 0;
      bundleData.cnic_front.uploaded_at = new Date();

      // Also OCR CNIC back for completeness
      const cnicBackDoc = await BnplDocument.findById(docIds.cnic_back);
      const ocrBack = await runOcrPipeline(await materializeLocal(cnicBackDoc.file_path), cnicBackDoc.mime_type);
      cnicBackDoc.ocr_raw_text = ocrBack.raw_text || "";
      cnicBackDoc.ocr_confidence = ocrBack.confidence || 0;
      cnicBackDoc.ocr_completed_at = new Date();
      cnicBackDoc.ocr_error = ocrBack.ocr_error || "";
      await cnicBackDoc.save();

      bundleData.cnic_back.ocr_raw_text = ocrBack.raw_text || "";
      bundleData.cnic_back.ocr_confidence = ocrBack.confidence || 0;
      bundleData.cnic_back.uploaded_at = new Date();
    } catch (ocrErr) {
      console.error("[bnpl] OCR pipeline error:", ocrErr.message);
    }

    bundleData.ocr_completed_at = new Date();
    await BnplDocumentBundle.create(bundleData);

    // Validate CNIC entered matches the CNIC on file in buyer profile
    const profile = await BnplUser.findOne({ buyer_id: req.user.id }).lean();
    if (profile && profile.cnic_enc) {
      const registeredCnic = decrypt(profile.cnic_enc);
      if (registeredCnic && buyerCnic && buyerCnic.replace(/-/g, "") !== registeredCnic.replace(/-/g, "")) {
        return res.status(400).json({
          success: false,
          error: `CNIC number entered (${buyerCnic}) does not match the CNIC on your profile (${registeredCnic}).`
        });
      }
    }

    // --- upsert BnplUser profile (captures CNIC for future fast-path) ---
    const finalCnic = buyerCnic || ocrCnic;
    await BnplUser.findOneAndUpdate(
      { buyer_id: req.user.id },
      {
        $set: {
          buyer_id: req.user.id,
          full_name: buyer ? buyer.name : accountTitle,
          phone: buyer ? buyer.phone : "",
          cnic_enc: finalCnic ? encrypt(finalCnic) : undefined,
          address: order.shipping_address
            ? `${order.shipping_address.line1 || ""}, ${order.shipping_address.city || ""}`.replace(/^,\s*/, "")
            : "",
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // --- Step 4: auto-approve small applications ---
    if (elig.auto_approve) {
      const planCalc = computePlan(order.total_amount, plan);
      const expires = offerExpiry();
      await BnplOfferLetter.create({
        application_id: applicationNo,
        offer_no: generateOfferNo(),
        buyer_id: req.user.id,
        approved_amount: planCalc.approved_amount,
        plan_months: plan,
        processing_fee: planCalc.processing_fee,
        monthly_installment: planCalc.monthly_installment,
        total_payable: planCalc.total_payable,
        valid_until: expires,
        status: "PENDING",
        installments: buildInstallmentSchedule(planCalc.monthly_installment, plan),
      });
    }

    // --- update order status + timeline ---
    await Order.updateOne(
      { order_id: order.order_id },
      {
        $set: {
          status: "PENDING_BNPL_APPROVAL",
          payment_method: "BNPL",
          bnpl_application_id: applicationNo,
        },
        $push: {
          timeline: {
            status: "PENDING_BNPL_APPROVAL",
            at: new Date(),
            by: "buyer",
            by_id: req.user.id,
            note: `BNPL application ${applicationNo} submitted (plan: ${plan} months)`,
          },
        },
      }
    );

    // --- notifications ---
    await notifyBuyerAndAdmin({
      buyer_id: req.user.id,
      title: "BNPL Application Submitted",
      message: `Your BNPL application ${applicationNo} for order ${order.order_id} has been submitted. ${
        elig.auto_approve ? "Auto-approved — offer letter generated." : "Pending bank verification (1-2 hours)."
      }`,
      type: "bnpl",
      ref_id: applicationNo,
    });

    const populated = await getApplicationForResponse(applicationNo);
    return res.status(201).json({
      success: true,
      message: elig.auto_approve
        ? "BNPL application auto-approved. Offer letter generated."
        : "BNPL application submitted. Pending bank verification.",
      application: populated,
      ocr: { extracted_cnic: ocrCnic, confidence: ocrConfidence },
    });
  } catch (err) {
    console.error("[bnpl] application error:", err);
    return res.status(500).json({ success: false, error: "Server error: " + err.message });
  }
});

// ---------- list buyer's applications ----------
router.get("/applications", requireBuyer, async (req, res) => {
  try {
    const rows = await BnplApplication.find({ buyer_id: req.user.id })
      .sort({ created_at: -1 })
      .lean();
    return res.json({ success: true, applications: rows });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- single application ----------
router.get("/applications/:application_no", requireBuyer, async (req, res) => {
  try {
    const app = await getApplicationForResponse(req.params.application_no, req.user.id);
    if (!app) return res.status(404).json({ success: false, error: "Application not found" });
    return res.json({ success: true, application: app });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 7: accept offer ----------
router.post("/applications/:application_no/accept-offer", requireBuyer, async (req, res) => {
  try {
    const app = await BnplApplication.findOne({
      application_no: req.params.application_no,
      buyer_id: req.user.id,
    });
    if (!app) return res.status(404).json({ success: false, error: "Application not found" });
    if (app.status !== "APPROVED") {
      return res.status(400).json({ success: false, error: `Cannot accept offer in status ${app.status}` });
    }

    // Check countdown timer expiration: offer_expires_at < now → reject
    if (app.offer_expires_at && new Date(app.offer_expires_at) < new Date()) {
      await BnplApplication.updateOne({ _id: app._id }, { $set: { status: "OFFER_EXPIRED" } });
      return res.status(400).json({ success: false, error: "Offer has expired (3-day countdown elapsed). Application transitioned to OFFER_EXPIRED." });
    }

    const offer = await BnplOfferLetter.findOne({ application_id: app.application_no });
    if (!offer) return res.status(404).json({ success: false, error: "Offer letter not found" });

    if (new Date(offer.valid_until) < new Date()) {
      await BnplOfferLetter.updateOne({ _id: offer._id }, { $set: { status: "EXPIRED" } });
      await BnplApplication.updateOne({ _id: app._id }, { $set: { status: "OFFER_EXPIRED" } });
      return res.status(400).json({ success: false, error: "Offer has expired" });
    }

    await BnplOfferLetter.updateOne(
      { _id: offer._id },
      { $set: { status: "ACCEPTED", accepted_at: new Date() } }
    );
    await BnplApplication.updateOne(
      { _id: app._id },
      { $set: { status: "OFFER_ACCEPTED" } }
    );

    // Order → CONFIRMED (ready for seller to prepare)
    await Order.updateOne(
      { order_id: app.order_id },
      {
        $set: { status: "CONFIRMED", payment_status: "PAID" },
        $push: {
          timeline: {
            status: "CONFIRMED",
            at: new Date(),
            by: "buyer",
            by_id: req.user.id,
            note: `BNPL offer accepted (${app.plan_months}-month plan). Order ready for seller fulfillment.`,
          },
        },
      }
    );

    await notifyBuyerAndAdmin({
      buyer_id: req.user.id,
      title: "BNPL Offer Accepted",
      message: `Your BNPL offer for application ${app.application_no} has been accepted. Order ${app.order_id} is now CONFIRMED.`,
      type: "bnpl",
      ref_id: app.application_no,
    });

    return res.json({
      success: true,
      message: "Offer accepted. Installment plan activated. Order is now CONFIRMED.",
      application: await getApplicationForResponse(app.application_no),
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- Step 7: decline offer ----------
router.post("/applications/:application_no/decline-offer", requireBuyer, async (req, res) => {
  try {
    const app = await BnplApplication.findOne({
      application_no: req.params.application_no,
      buyer_id: req.user.id,
    });
    if (!app) return res.status(404).json({ success: false, error: "Application not found" });
    if (app.status !== "APPROVED") {
      return res.status(400).json({ success: false, error: `Cannot decline offer in status ${app.status}` });
    }

    const offer = await BnplOfferLetter.findOne({ application_id: app.application_no });
    if (offer) {
      await BnplOfferLetter.updateOne({ _id: offer._id }, { $set: { status: "DECLINED" } });
    }
    await BnplApplication.updateOne({ _id: app._id }, { $set: { status: "OFFER_DECLINED" } });

    // Order → CANCELLED
    await Order.updateOne(
      { order_id: app.order_id },
      {
        $set: { status: "CANCELLED", payment_status: "CANCELLED" },
        $push: {
          timeline: {
            status: "CANCELLED",
            at: new Date(),
            by: "buyer",
            by_id: req.user.id,
            note: "BNPL offer declined by buyer. Order cancelled.",
          },
        },
      }
    );

    await notifyBuyerAndAdmin({
      buyer_id: req.user.id,
      title: "BNPL Offer Declined",
      message: `You declined the BNPL offer for application ${app.application_no}. Order ${app.order_id} has been cancelled.`,
      type: "bnpl",
      ref_id: app.application_no,
    });

    return res.json({ success: true, message: "Offer declined. Order cancelled." });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ---------- helper: shape application for JSON response ----------
async function getApplicationForResponse(applicationNo, buyerId) {
  const filter = { application_no: applicationNo };
  if (buyerId) filter.buyer_id = buyerId;
  const app = await BnplApplication.findOne(filter).lean();
  if (!app) return null;

  const bank = await BnplBank.findOne({ bank_id: app.bank_id }).lean();
  const offer = await BnplOfferLetter.findOne({ application_id: app.application_no }).lean();
  // Prefer BnplDocumentBundle over individual BnplDocument rows (v3.2)
  const bundle = await BnplDocumentBundle.findOne({ application_id: app.application_no }).lean();
  let docs;
  if (bundle) {
    docs = ["cnic_front", "cnic_back", "utility_bill"]
      .map(type => {
        const b = bundle[type] || {};
        return {
          _id: bundle._id,
          doc_type: type,
          original_name: b.original_name || "",
          mime_type: b.mime_type || "",
          url: b.file_path ? publicUrl(b.file_path) : "",
          ocr_extracted_cnic: type === "cnic_front" ? (b.ocr_extracted_cnic || "") : "",
          ocr_confidence: b.ocr_confidence || 0,
          ocr_completed_at: bundle.ocr_completed_at || null,
          ocr_error: null,
        };
      });
  } else {
    docs = await BnplDocument.find({ application_id: app.application_no }).lean();
    docs = docs.map(d => ({
      _id: d._id,
      doc_type: d.doc_type,
      original_name: d.original_name,
      mime_type: d.mime_type,
      url: publicUrl(d.file_path),
      ocr_extracted_cnic: d.ocr_extracted_cnic,
      ocr_confidence: d.ocr_confidence,
      ocr_completed_at: d.ocr_completed_at,
      ocr_error: d.ocr_error || null,
    }));
  }

  const ibanPlain = app.iban_enc ? decrypt(app.iban_enc) : null;
  return {
    application_no: app.application_no,
    order_id: app.order_id,
    buyer_id: app.buyer_id,
    bank: bank
      ? { bank_id: bank.bank_id, code: bank.code, name: bank.name }
      : null,
    iban_masked: ibanPlain ? maskIban(ibanPlain) : null,
    account_title: app.account_title,
    plan_months: app.plan_months,
    amount: app.amount,
    status: app.status,
    // risk_score and risk_category excluded from buyer-facing responses (v3.2)
    officer_comment: app.officer_comment,
    decision_at: app.decision_at,
    offer_expires_at: app.offer_expires_at,
    created_at: app.created_at,
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
    documents: docs.map(d => ({
      _id: d._id,
      doc_type: d.doc_type,
      original_name: d.original_name,
      mime_type: d.mime_type,
      url: publicUrl(d.file_path),
      ocr_extracted_cnic: d.ocr_extracted_cnic,
      ocr_confidence: d.ocr_confidence,
      ocr_completed_at: d.ocr_completed_at,
      ocr_error: d.ocr_error || null,
    })),
  };
}

module.exports = router;
