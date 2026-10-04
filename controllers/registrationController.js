/**
 * OTP-first registration (buyer / seller).
 *
 *   POST /api/auth/buyer/register    ┐ validate → hash password → pending record
 *   POST /api/auth/seller/register   ┘ + 6-digit OTP (hash only) → email → 202
 *   POST /api/auth/register/verify     { portal, email, otp, registration_token }
 *                                      → create the REAL account → session (201)
 *   POST /api/auth/register/resend     { portal, email, registration_token } → new OTP
 *
 * No Buyer / Seller document exists until the OTP is verified. Registering an
 * email that already has an account gets the same 202 response (an "account
 * already exists" email is sent instead of a code), so the form cannot be used to
 * discover which emails are registered. Admin registration does not exist.
 *
 * `registration_token` is returned only to the browser that submitted the form and
 * is required to verify/resend: someone who re-submits the form for another person's
 * email cannot complete (or hijack) that person's registration.
 */
const { v4: uuidv4 } = require("uuid");
const Buyer = require("../models/Buyer");
const PendingRegistration = require("../models/PendingRegistration");
const passwords = require("../lib/passwords");
const sellerClient = require("../services/sellerClient");
const mailer = require("../lib/mailer");
const { registrationOtpEmail, accountExistsEmail } = require("../lib/emailTemplates");
const otp = require("../lib/registrationOtp");

const PORTALS = ["buyer", "seller"];
const auth = () => require("./authController"); // lazy: avoids a require cycle

const INVALID_OTP = { success: false, code: "INVALID_OTP", error: "That code is incorrect. Please check the email and try again." };
const OTP_EXPIRED = { success: false, code: "OTP_EXPIRED", error: "This code has expired. Request a new code." };
const TOO_MANY_ATTEMPTS = { success: false, code: "TOO_MANY_ATTEMPTS", error: "Too many incorrect attempts. Request a new code." };
const EMAIL_IN_USE = { success: false, code: "EMAIL_IN_USE", error: "This email is already registered. Please sign in." };

const minutes = (n) => n * 60 * 1000;

/** Same body whether or not the email already has an account. */
function pendingResponse(portal, email, registrationToken) {
  return {
    success: true,
    verification_required: true,
    portal,
    email,
    registration_token: registrationToken,
    otp_expires_in: otp.OTP_TTL_MINUTES * 60,
    resend_after: otp.RESEND_COOLDOWN_SECONDS,
    message: `We sent a 6-digit verification code to ${email}. Enter it to finish creating your account.`,
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

function validate(portal, body) {
  const { normalizeEmail, EMAIL_RE, optionalString } = auth();
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = normalizeEmail(body.email);
  const password = body.password;
  const phone = optionalString(body.phone, 30);
  const city = optionalString(body.city, 60);
  const sellerType = portal === "seller" ? (body.seller_type === undefined ? "individual" : body.seller_type) : null;

  const errors = [];
  if (!name || name.length > 100) errors.push("Name is required (max 100 characters).");
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) errors.push("A valid email is required.");
  if (phone === null) errors.push("Phone must be text (max 30 characters).");
  if (city === null) errors.push("City must be text (max 60 characters).");
  if (portal === "seller" && !["individual", "company"].includes(sellerType)) errors.push("Seller type must be individual or company.");
  const policy = passwords.validatePasswordPolicy(password, { email });
  if (!policy.ok) errors.push(...policy.errors);
  return { errors, data: { name, email, password, phone, city, sellerType } };
}

function _sendOtpEmail(to, name, code) {
  // Background: the response must not wait for (or reveal) mail delivery.
  mailer.sendMailSafely({ to, ...registrationOtpEmail({ name, otp: code, ttlMinutes: otp.OTP_TTL_MINUTES }) });
}

// ── POST /api/auth/{buyer|seller}/register ──────────────────────────────────

function startRegistration(portal) {
  return async function register(req, res) {
    try {
      const { errors, data } = validate(portal, req.body || {});
      if (errors.length) {
        return res.status(400).json({ success: false, code: "VALIDATION_ERROR", error: errors[0], errors });
      }
      // Hash first on every path so "new" and "already registered" take the same time.
      const passwordHash = await passwords.hashPassword(data.password);
      const registrationToken = otp.generateRegistrationToken();
      const body = pendingResponse(portal, data.email, registrationToken);

      if (await auth().emailInUse(data.email)) {
        mailer.sendMailSafely({ to: data.email, ...accountExistsEmail({ name: "" }) });
        return res.status(202).json(body);
      }

      const existing = await PendingRegistration.findOne({ normalized_email: data.email }).lean();
      if (existing?.status === "creating") return res.status(202).json(body); // verification in flight

      const code = otp.generateOtp();
      const now = new Date();
      await PendingRegistration.findOneAndUpdate(
        { normalized_email: data.email },
        {
          $set: {
            email: data.email,
            normalized_email: data.email,
            portal,
            name: data.name,
            phone: data.phone,
            city: data.city,
            seller_type: data.sellerType,
            password_hash: passwordHash,
            otp_hash: otp.hashOtp(portal, data.email, code), // replaces (invalidates) any previous code
            otp_expires_at: new Date(now.getTime() + minutes(otp.OTP_TTL_MINUTES)),
            otp_attempts: 0,
            last_otp_sent_at: now,
            registration_token_hash: otp.hashRegistrationToken(registrationToken),
            status: "pending",
            expires_at: new Date(now.getTime() + otp.PENDING_TTL_HOURS * 3600 * 1000),
          },
          $inc: { otp_send_count: 1 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      _sendOtpEmail(data.email, data.name, code);
      return res.status(202).json(body);
    } catch (err) {
      console.error(`[auth] ${portal} register error: ${err.message}`);
      return res.status(500).json({ success: false, error: "Registration failed. Please try again." });
    }
  };
}

// ── Account creation (only after a verified OTP) ───────────────────────────

async function _createAccount(p) {
  const now = new Date();
  if (p.portal === "buyer") {
    try {
      const buyer = await Buyer.create({
        buyer_id: `buyer_${uuidv4().replace(/-/g, "").slice(0, 16)}`,
        name: p.name,
        email: p.normalized_email,
        password_hash: p.password_hash,
        phone: p.phone || "",
        city: p.city || "",
        auth: {
          email_verified: true, // proven by the OTP
          email_verified_at: now,
          token_version: 0,
          failed_logins: 0,
          password_changed_at: now,
          last_login_at: now,
        },
      });
      const doc = typeof buyer.toObject === "function" ? buyer.toObject() : buyer;
      return { ok: true, kind: "buyer", id: doc.buyer_id, doc };
    } catch (err) {
      if (err && err.code === 11000) return { ok: false, reason: "EMAIL_IN_USE" };
      throw err;
    }
  }
  const iso = now.toISOString();
  const created = await sellerClient.createSellerInternal({
    name: p.name,
    email: p.normalized_email,
    phone: p.phone || "",
    city: p.city || "",
    seller_type: p.seller_type || "individual",
    password_hash: p.password_hash,
    auth: { email_verified: true, token_version: 0, failed_logins: 0, password_changed_at: iso, last_login_at: iso },
  });
  if (created?.success === true && created.seller?.seller_id) {
    return { ok: true, kind: "seller", id: created.seller.seller_id, doc: created.seller };
  }
  if (created?.code === "EMAIL_IN_USE") return { ok: false, reason: "EMAIL_IN_USE" };
  return { ok: false, reason: "UNAVAILABLE" };
}

// ── POST /api/auth/register/verify ──────────────────────────────────────────

async function verifyRegistration(req, res) {
  try {
    const { normalizeEmail } = auth();
    const body = req.body || {};
    const portal = body.portal;
    const email = normalizeEmail(body.email);
    const code = typeof body.otp === "string" ? body.otp.trim() : "";
    const token = body.registration_token;
    if (!PORTALS.includes(portal) || !email || !otp.isWellFormedOtp(code) || !otp.isWellFormedRegistrationToken(token)) {
      return res.status(400).json(INVALID_OTP);
    }

    const p = await PendingRegistration.findOne({ normalized_email: email, portal, status: "pending" }).lean();
    if (!p || !otp.registrationTokenMatches(p.registration_token_hash, token)) return res.status(400).json(INVALID_OTP);
    if (!p.otp_hash || !p.otp_expires_at || new Date(p.otp_expires_at) <= new Date()) return res.status(400).json(OTP_EXPIRED);
    if ((p.otp_attempts || 0) >= otp.MAX_ATTEMPTS) return res.status(429).json(TOO_MANY_ATTEMPTS);

    // Count the attempt atomically BEFORE comparing (parallel guesses cannot exceed the cap).
    const counted = await PendingRegistration.findOneAndUpdate(
      { _id: p._id, otp_hash: p.otp_hash, otp_attempts: { $lt: otp.MAX_ATTEMPTS } },
      { $inc: { otp_attempts: 1 } },
      { new: true }
    ).lean();
    if (!counted) return res.status(429).json(TOO_MANY_ATTEMPTS);

    if (!otp.otpMatches(p.otp_hash, portal, email, code)) {
      const remaining = otp.MAX_ATTEMPTS - counted.otp_attempts;
      if (remaining <= 0) {
        await PendingRegistration.updateOne({ _id: p._id, otp_hash: p.otp_hash }, { $unset: { otp_hash: "", otp_expires_at: "" } });
        return res.status(429).json(TOO_MANY_ATTEMPTS);
      }
      return res.status(400).json({ ...INVALID_OTP, attempts_remaining: remaining });
    }

    // Claim the record (single use): the OTP is invalidated before the account exists.
    const claimed = await PendingRegistration.findOneAndUpdate(
      { _id: p._id, status: "pending", otp_hash: p.otp_hash },
      { $set: { status: "creating" }, $unset: { otp_hash: "", otp_expires_at: "" } },
      { new: true }
    ).lean();
    if (!claimed) return res.status(400).json(INVALID_OTP);

    // Re-check one-email-one-role immediately before creating the account.
    if (await auth().emailInUse(email)) {
      await PendingRegistration.deleteOne({ _id: p._id });
      return res.status(409).json(EMAIL_IN_USE);
    }

    let created;
    try {
      created = await _createAccount(claimed);
    } catch (err) {
      created = { ok: false, reason: "ERROR", message: err.message };
    }
    if (!created.ok) {
      if (created.reason === "EMAIL_IN_USE") {
        await PendingRegistration.deleteOne({ _id: p._id });
        return res.status(409).json(EMAIL_IN_USE);
      }
      // Keep the sign-up (the code is spent): the user can request a new code and retry.
      await PendingRegistration.updateOne({ _id: p._id }, { $set: { status: "pending" } });
      console.error(`[auth] register verify: account creation failed (${created.reason})`);
      return res.status(503).json({ success: false, code: "SERVICE_UNAVAILABLE", error: "We could not create your account right now. Request a new code and try again." });
    }

    await PendingRegistration.deleteOne({ _id: p._id });
    // Same result as the previous register response: the new user is signed in.
    return auth().sendSession(req, res, 201, {
      kind: created.kind, id: created.id, tokenVersion: 0, profileDoc: created.doc, emailVerified: true,
    });
  } catch (err) {
    console.error(`[auth] register verify error: ${err.message}`);
    return res.status(500).json({ success: false, error: "Verification failed. Please try again." });
  }
}

// ── POST /api/auth/register/resend ──────────────────────────────────────────

async function resendRegistrationOtp(req, res) {
  const generic = {
    success: true,
    message: "If this sign-up is still pending, a new code has been sent.",
    resend_after: otp.RESEND_COOLDOWN_SECONDS,
    otp_expires_in: otp.OTP_TTL_MINUTES * 60,
  };
  try {
    const { normalizeEmail } = auth();
    const body = req.body || {};
    const portal = body.portal;
    const email = normalizeEmail(body.email);
    const token = body.registration_token;
    if (!PORTALS.includes(portal) || !email || !otp.isWellFormedRegistrationToken(token)) return res.json(generic);

    const p = await PendingRegistration.findOne({ normalized_email: email, portal, status: "pending" }).lean();
    if (!p || !otp.registrationTokenMatches(p.registration_token_hash, token)) return res.json(generic);

    const now = new Date();
    const waitMs = p.last_otp_sent_at ? otp.RESEND_COOLDOWN_SECONDS * 1000 - (now - new Date(p.last_otp_sent_at)) : 0;
    if (waitMs > 0) {
      return res.status(429).json({
        success: false, code: "RESEND_COOLDOWN",
        error: "Please wait before requesting another code.",
        retry_after: Math.ceil(waitMs / 1000),
      });
    }

    const code = otp.generateOtp();
    const updated = await PendingRegistration.findOneAndUpdate(
      { _id: p._id, status: "pending", last_otp_sent_at: p.last_otp_sent_at },
      {
        $set: {
          otp_hash: otp.hashOtp(portal, email, code), // the previous code stops working
          otp_expires_at: new Date(now.getTime() + minutes(otp.OTP_TTL_MINUTES)),
          otp_attempts: 0,
          last_otp_sent_at: now,
          expires_at: new Date(now.getTime() + otp.PENDING_TTL_HOURS * 3600 * 1000),
        },
        $inc: { otp_send_count: 1 },
      },
      { new: true }
    ).lean();
    if (updated) _sendOtpEmail(p.email, p.name, code);
    return res.json(generic);
  } catch (err) {
    console.error(`[auth] register resend error: ${err.message}`);
    return res.status(500).json({ success: false, error: "Could not send a new code. Please try again." });
  }
}

module.exports = {
  registerBuyer: startRegistration("buyer"),
  registerSeller: startRegistration("seller"),
  verifyRegistration,
  resendRegistrationOtp,
};
