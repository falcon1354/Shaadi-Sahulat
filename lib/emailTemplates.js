/**
 * Account emails. Links are built from FRONTEND_ORIGIN (never hardcoded).
 * Emails contain ONLY the one-time link — never passwords, hashes, ids or JWTs.
 */

const { APP_NAME } = require("./mailer");
const { getAuthConfig } = require("./tokens");

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function frontendLink(pathname, token) {
  const origin = getAuthConfig().frontendOrigin.replace(/\/$/, "");
  return `${origin}${pathname}?token=${encodeURIComponent(token)}`;
}

function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#FCFBFB;margin:0;padding:24px;color:#333">
<div style="max-width:520px;margin:auto;background:#fff;border:1px solid #FBEFF1;border-radius:16px;padding:28px">
<h2 style="color:#a37b3d;margin-top:0">${escapeHtml(APP_NAME)}</h2><h3 style="margin:0 0 12px">${escapeHtml(title)}</h3>
${bodyHtml}
</div></body></html>`;
}

function button(href, label) {
  return `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="background:#a37b3d;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:bold">${escapeHtml(label)}</a></p>
<p style="font-size:12px;color:#888">If the button does not work, copy this link into your browser:<br>${escapeHtml(href)}</p>`;
}

function passwordResetEmail({ name, token, ttlMinutes }) {
  const link = frontendLink("/reset-password", token);
  const subject = `${APP_NAME}: reset your password`;
  const text = [
    `Hello ${name || ""},`.trim(),
    "",
    `We received a request to reset the password for your ${APP_NAME} account.`,
    `Reset your password using this link (valid for ${ttlMinutes} minutes, one use only):`,
    link,
    "",
    "If you did not request a password reset, you can ignore this email — your password will not change.",
  ].join("\n");
  const html = layout("Reset your password", `
<p>Hello ${escapeHtml(name || "")},</p>
<p>We received a request to reset the password for your ${escapeHtml(APP_NAME)} account.</p>
${button(link, "Reset password")}
<p>This link is valid for <b>${ttlMinutes} minutes</b> and can be used once.</p>
<p style="color:#888">If you did not request a password reset, you can ignore this email — your password will not change.</p>`);
  return { subject, text, html };
}

function verificationEmail({ name, token, ttlHours }) {
  const link = frontendLink("/verify-email", token);
  const subject = `${APP_NAME}: verify your email address`;
  const text = [
    `Hello ${name || ""},`.trim(),
    "",
    `Please confirm the email address for your ${APP_NAME} account:`,
    link,
    "",
    `This link is valid for ${ttlHours} hours and can be used once.`,
  ].join("\n");
  const html = layout("Verify your email address", `
<p>Hello ${escapeHtml(name || "")},</p>
<p>Please confirm the email address for your ${escapeHtml(APP_NAME)} account.</p>
${button(link, "Verify email")}
<p>This link is valid for <b>${ttlHours} hours</b> and can be used once.</p>`);
  return { subject, text, html };
}

/** Sign-up OTP (the account is created only after this code is entered). */
function registrationOtpEmail({ name, otp, ttlMinutes }) {
  const code = String(otp);
  const subject = `${APP_NAME}: Verify your email`;
  const text = [
    `Hello ${name || ""},`.trim(),
    "",
    `Your ${APP_NAME} verification code is:`,
    "",
    `    ${code}`,
    "",
    `Enter it on the sign-up page to create your account. The code expires in ${ttlMinutes} minutes.`,
    "",
    "Never share this code with anyone. ShaadiSahulat staff will never ask for it.",
    "If you did not try to create an account, you can ignore this email — no account will be created.",
  ].join("\n");
  const html = layout("Verify your email", `
<p>Hello ${escapeHtml(name || "")},</p>
<p>Your ${escapeHtml(APP_NAME)} verification code is:</p>
<p style="margin:24px 0;text-align:center"><span style="display:inline-block;font-size:32px;font-weight:bold;letter-spacing:10px;color:#a37b3d;background:#FCFBFB;border:1px solid #FBEFF1;border-radius:12px;padding:12px 20px">${escapeHtml(code)}</span></p>
<p>Enter it on the sign-up page to create your account. The code expires in <b>${ttlMinutes} minutes</b>.</p>
<p style="color:#b42318"><b>Never share this code with anyone.</b> ShaadiSahulat staff will never ask for it.</p>
<p style="color:#888">If you did not try to create an account, you can ignore this email — no account will be created.</p>`);
  return { subject, text, html };
}

/**
 * Sent instead of an OTP when someone tries to register an email that already has
 * an account (the API answers identically, so the form cannot be used to probe emails).
 */
function accountExistsEmail({ name }) {
  const origin = getAuthConfig().frontendOrigin.replace(/\/$/, "");
  const forgot = `${origin}/forgot-password`;
  const subject = `${APP_NAME}: Verify your email`;
  const text = [
    `Hello ${name || ""},`.trim(),
    "",
    `Someone (hopefully you) tried to create a new ${APP_NAME} account with this email address.`,
    "An account with this email already exists, so no new account was created.",
    "",
    `Sign in with your existing password, or reset it here: ${forgot}`,
    "",
    "If this wasn't you, you can ignore this email — your account has not changed.",
  ].join("\n");
  const html = layout("You already have an account", `
<p>Hello ${escapeHtml(name || "")},</p>
<p>Someone (hopefully you) tried to create a new ${escapeHtml(APP_NAME)} account with this email address.
An account with this email already exists, so no new account was created.</p>
<p>Sign in with your existing password, or reset it:</p>
${button(forgot, "Reset password")}
<p style="color:#888">If this wasn't you, you can ignore this email — your account has not changed.</p>`);
  return { subject, text, html };
}

module.exports = { passwordResetEmail, verificationEmail, registrationOtpEmail, accountExistsEmail };
