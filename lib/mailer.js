/**
 * Outgoing email (sign-up OTP, password reset, email verification).
 *
 * EMAIL_TRANSPORT:
 *   smtp     → nodemailer SMTP (SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM)
 *   console  → (development; only when explicitly set) writes each message as an .eml file to the local
 *              outbox (MAIL_OUTBOX_DIR, default ./.mail-outbox — git-ignored). The console
 *              only shows subject, masked recipient and file name — never the link/token.
 *   disabled → drop messages
 * Tests inject an in-memory transport with setMailTransport(fn) — no real email is sent.
 *
 * Nothing in this module logs message bodies (they contain one-time links).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const APP_NAME = "ShaadiSahulat";
let injectedTransport = null;
let smtpTransporter = null;

/** Tests: replace delivery with fn(message). Pass null to restore normal behaviour. */
function setMailTransport(fn) {
  injectedTransport = typeof fn === "function" ? fn : null;
}

function maskEmail(email) {
  const [user = "", domain = ""] = String(email).split("@");
  return `${user.slice(0, 2)}***@${domain}`;
}

/**
 * Which transport is configured. There is NO implicit fallback:
 *   "smtp" | "console" | "disabled"  — exactly what EMAIL_TRANSPORT says
 *   "invalid"                        — unset or unknown value (emails fail loudly; never
 *                                      silently written to the console outbox instead)
 */
function transportMode(env = process.env) {
  const v = String(env.EMAIL_TRANSPORT || "").trim().toLowerCase();
  if (v === "smtp" || v === "console") return v;
  if (v === "disabled" || v === "none") return "disabled";
  return "invalid";
}

function fromAddress(env = process.env) {
  if (env.SMTP_FROM && String(env.SMTP_FROM).trim()) return String(env.SMTP_FROM).trim();
  // Gmail rewrites/rejects other senders: default to the authenticated account.
  const user = String(env.SMTP_USER || "").trim();
  if (transportMode(env) === "smtp" && user) return `${APP_NAME} <${user}>`;
  return `${APP_NAME} <no-reply@shaadisahulat.local>`;
}

const isGmail = (host) => /(^|\.)(gmail|googlemail)\.com$/i.test(String(host || "").trim());
const addressOf = (from) => { const m = String(from || "").match(/<([^>]+)>/); return (m ? m[1] : String(from || "")).trim().toLowerCase(); };

/**
 * Nodemailer SMTP options from the environment (pure — unit-tested).
 *   port 465 → implicit TLS (secure: true)      — always, whatever SMTP_SECURE says
 *   port 587 → STARTTLS, required (requireTLS)   — always, whatever SMTP_SECURE says
 *   other ports → SMTP_SECURE=true|false
 * Gmail: SMTP_HOST=smtp.gmail.com with a Google *App Password* (spaces are removed).
 */
function smtpOptions(env = process.env) {
  const host = String(env.SMTP_HOST || "").trim();
  if (!host) throw new Error("SMTP is not configured (SMTP_HOST missing)");
  const port = Number(env.SMTP_PORT) || 587;
  const secureFlag = String(env.SMTP_SECURE || "").trim().toLowerCase();
  // A secure/port mismatch is the #1 SMTP misconfiguration ("wrong version number" / timeouts).
  const secure = port === 465 ? true : port === 587 ? false : secureFlag === "true";
  const user = String(env.SMTP_USER || "").trim();
  let pass = String(env.SMTP_PASSWORD || "");
  if (isGmail(host)) pass = pass.replace(/\s+/g, ""); // Google shows app passwords in 4 groups
  return {
    host,
    port,
    secure,
    requireTLS: !secure,
    auth: user ? { user, pass } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  };
}

/**
 * Configuration check WITHOUT network access. Never returns values — only variable
 * names and safe facts. { ok, missing: [names], warnings: [text] }
 */
function smtpConfigStatus(env = process.env) {
  const missing = [];
  // SMTP_PORT is optional (defaults to 587); SMTP_FROM defaults to SMTP_USER.
  for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"]) {
    if (!String(env[k] || "").trim()) missing.push(k);
  }
  const warnings = [];
  const host = String(env.SMTP_HOST || "").trim();
  const port = Number(env.SMTP_PORT) || 587;
  const flag = String(env.SMTP_SECURE || "").trim().toLowerCase();
  if (port === 465 && flag === "false") warnings.push("SMTP_PORT=465 needs SMTP_SECURE=true (using TLS)");
  if (port === 587 && flag === "true") warnings.push("SMTP_PORT=587 needs SMTP_SECURE=false (using STARTTLS)");
  if (isGmail(host)) {
    const pass = String(env.SMTP_PASSWORD || "").replace(/\s+/g, "");
    if (pass && !/^[a-z]{16}$/i.test(pass)) {
      warnings.push("SMTP_PASSWORD does not look like a 16-letter Google App Password (a normal Gmail password is rejected)");
    }
    const user = String(env.SMTP_USER || "").trim().toLowerCase();
    if (!String(env.SMTP_FROM || "").trim()) {
      warnings.push("SMTP_FROM not set — using SMTP_USER as the sender");
    } else if (user && addressOf(env.SMTP_FROM) !== user) {
      warnings.push("SMTP_FROM address differs from SMTP_USER — Gmail may rewrite or reject it (use the same address)");
    }
  }
  return { ok: missing.length === 0, missing, warnings };
}

/** Safe description for logs/diagnostics — never includes the password. */
function describeSmtp(env = process.env) {
  const o = smtpOptions(env);
  return `${o.host}:${o.port} (${o.secure ? "TLS" : "STARTTLS"}) as ${o.auth ? maskEmail(o.auth.user) : "no auth"}`;
}

/**
 * Safe summary of an SMTP/Nodemailer error: code, SMTP response code, command and
 * the server's reason (e.g. Gmail "535-5.7.8 Username and Password not accepted"),
 * with any email address masked. Never includes credentials or message content.
 */
function describeSmtpError(err) {
  if (!err) return "unknown error";
  const reason = String(err.response || err.message || "")
    .split(/\r?\n/)[0]
    .replace(/[^\s<>@]+@[^\s<>@]+/g, (m) => maskEmail(m))
    .slice(0, 300);
  const hint = err.responseCode === 535 || err.code === "EAUTH"
    ? " — check SMTP_USER and use a Google App Password for SMTP_PASSWORD"
    : err.code === "ESOCKET" || err.code === "ETIMEDOUT" || err.code === "ECONNECTION"
      ? " — check SMTP_HOST/SMTP_PORT/SMTP_SECURE and outbound network access"
      : "";
  return [err.code, err.responseCode, err.command].filter(Boolean).join(" ") + (reason ? `: ${reason}` : "") + hint;
}

function getSmtpTransporter() {
  if (smtpTransporter) return smtpTransporter;
  const nodemailer = require("nodemailer");
  smtpTransporter = nodemailer.createTransport(smtpOptions());
  return smtpTransporter;
}

/**
 * Startup / diagnostics check. Resolves { ok, status, detail } where status is one of
 *   "Console transport - NOT delivered" | "Delivery disabled" | "Invalid EMAIL_TRANSPORT"
 *   | "Missing SMTP configuration" | "SMTP authentication successful"
 *   | "SMTP authentication failed" | "SMTP connection failed"
 * and detail never contains a secret.
 */
async function verifyTransport(env = process.env) {
  const transport = transportMode(env);
  if (transport === "disabled") {
    return { ok: true, status: "Delivery disabled", detail: "EMAIL_TRANSPORT=disabled — emails are dropped" };
  }
  if (transport === "invalid") {
    return { ok: false, status: "Invalid EMAIL_TRANSPORT", detail: "set EMAIL_TRANSPORT to smtp, console or disabled in .env — emails cannot be sent" };
  }
  if (transport === "console") {
    return {
      ok: true,
      status: "Console transport - NOT delivered",
      detail: "EMAIL_TRANSPORT=console — emails are written to .mail-outbox and NOT delivered to real inboxes (set EMAIL_TRANSPORT=smtp + SMTP_* to send)",
    };
  }
  const cfg = smtpConfigStatus(env);
  if (!cfg.ok) {
    return { ok: false, status: "Missing SMTP configuration", detail: `set ${cfg.missing.join(", ")} in .env`, warnings: cfg.warnings };
  }
  try {
    await getSmtpTransporter().verify();
    return { ok: true, status: "SMTP authentication successful", detail: `SMTP configured: ${describeSmtp(env)}`, warnings: cfg.warnings };
  } catch (err) {
    const authProblem = err && (err.code === "EAUTH" || err.responseCode === 535 || err.responseCode === 534);
    return {
      ok: false,
      status: authProblem ? "SMTP authentication failed" : "SMTP connection failed",
      detail: `${describeSmtp(env)} — ${describeSmtpError(err)}`,
      warnings: cfg.warnings,
    };
  }
}

function writeToOutbox(message) {
  const dir = process.env.MAIL_OUTBOX_DIR || path.join(__dirname, "..", ".mail-outbox");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${Date.now()}-${crypto.randomBytes(4).toString("hex")}.eml`);
  const eml = [
    `From: ${message.from}`,
    `To: ${message.to}`,
    `Subject: ${message.subject}`,
    `Date: ${new Date().toUTCString()}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    message.text,
  ].join("\r\n");
  fs.writeFileSync(file, eml, { encoding: "utf8", mode: 0o600 });
  return path.basename(file);
}

/**
 * Send one message. Resolves to { delivered, transport, messageId? }. Throws on SMTP
 * failure (use sendMailSafely() in request paths); errors never include the body.
 */
async function sendMail({ to, subject, text, html }) {
  const message = { from: fromAddress(), to, subject, text, html };
  if (injectedTransport) {
    await injectedTransport(message);
    return { delivered: true, transport: "injected" };
  }
  const transport = transportMode();
  if (transport === "invalid") {
    throw Object.assign(new Error("EMAIL_TRANSPORT must be smtp, console or disabled"), { code: "ECONFIG" });
  }
  if (transport === "smtp") {
    // No fallback to the console outbox: a broken SMTP setup fails loudly.
    const cfg = smtpConfigStatus();
    if (!cfg.ok) throw Object.assign(new Error(`Missing SMTP configuration: set ${cfg.missing.join(", ")}`), { code: "ECONFIG" });
    const info = await getSmtpTransporter().sendMail(message);
    const rejected = (info && info.rejected) || [];
    const accepted = (info && info.accepted) || [];
    // "Delivered" means the SMTP server ACCEPTED the message for this recipient.
    if (rejected.length || !accepted.length) {
      throw Object.assign(new Error("recipient not accepted by the SMTP server"), { code: "EENVELOPE", response: info && info.response });
    }
    const smtpReply = String((info && info.response) || "").split(/\r?\n/)[0].slice(0, 120);
    console.log(`[mail] sent "${subject}" to ${maskEmail(to)} via SMTP (${describeSmtp()}) — server: ${smtpReply}`);
    return { delivered: true, transport: "smtp", messageId: info && info.messageId };
  }
  if (transport === "disabled") return { delivered: false, transport: "disabled" };
  const file = writeToOutbox(message);
  console.log(`[mail] "${subject}" for ${maskEmail(to)} written to .mail-outbox/${file} (Console transport - NOT delivered)`);
  return { delivered: false, transport: "console", file };
}

/** Fire-and-forget helper: delivery failures are logged (no body/link/secret), never surfaced to clients. */
function sendMailSafely(message) {
  return sendMail(message).catch((err) => {
    console.error(`[mail] delivery FAILED for "${message.subject}" to ${maskEmail(message.to)}: ${describeSmtpError(err)}`);
    return { delivered: false, error: true };
  });
}

module.exports = {
  APP_NAME, sendMail, sendMailSafely, setMailTransport, maskEmail,
  smtpOptions, smtpConfigStatus, describeSmtp, describeSmtpError, verifyTransport, fromAddress, transportMode,
};
