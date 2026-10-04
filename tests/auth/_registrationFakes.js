/**
 * Shared test helpers for OTP-first registration (not a test file itself).
 *   installPendingFake()  → in-memory PendingRegistration model (dotted $set/$inc/$unset, $lt, upsert)
 *   captureMail()         → in-memory mail transport; otpFor(email) reads the latest code
 */
const PendingRegistration = require("../../models/PendingRegistration");
const mailer = require("../../lib/mailer");

const clone = (x) => (x ? structuredClone(x) : null);

function condOk(actual, cond) {
  if (cond && typeof cond === "object" && !(cond instanceof Date) && Object.keys(cond).some((k) => k.startsWith("$"))) {
    return Object.entries(cond).every(([op, arg]) => {
      if (op === "$lt") return actual !== undefined && actual < arg;
      if (op === "$gt") return actual !== undefined && actual > arg;
      if (op === "$ne") return String(actual) !== String(arg);
      return true;
    });
  }
  if (cond === null) return actual == null;
  if (cond instanceof Date) return actual instanceof Date && actual.getTime() === cond.getTime();
  return actual !== undefined && String(actual) === String(cond);
}
const matches = (doc, f) => Object.entries(f).every(([k, v]) => condOk(doc[k], v));

function apply(doc, u) {
  for (const [k, v] of Object.entries(u.$set || {})) doc[k] = v;
  for (const [k, v] of Object.entries(u.$inc || {})) doc[k] = (doc[k] || 0) + v;
  for (const k of Object.keys(u.$unset || {})) delete doc[k];
}

function installPendingFake() {
  const rows = [];
  let seq = 1;
  const chain = (get) => ({ lean: async () => clone(get()), then: (res, rej) => Promise.resolve(clone(get())).then(res, rej) });
  PendingRegistration.findOne = (f) => chain(() => rows.find((d) => matches(d, f)) || null);
  PendingRegistration.findOneAndUpdate = (f, u, opts = {}) => chain(() => {
    let d = rows.find((x) => matches(x, f));
    if (!d && opts.upsert) {
      d = { _id: `pr${seq++}`, otp_attempts: 0, otp_send_count: 0, status: "pending", created_at: new Date() };
      for (const [k, v] of Object.entries(f)) if (typeof v !== "object") d[k] = v;
      rows.push(d);
    }
    if (!d) return null;
    apply(d, u);
    d.updated_at = new Date();
    return d;
  });
  PendingRegistration.updateOne = async (f, u) => { const d = rows.find((x) => matches(x, f)); if (d) apply(d, u); return { modifiedCount: d ? 1 : 0 }; };
  PendingRegistration.deleteOne = async (f) => { const i = rows.findIndex((x) => matches(x, f)); if (i >= 0) rows.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; };
  return rows;
}

function captureMail() {
  const mails = [];
  mailer.setMailTransport(async (m) => { mails.push(m); });
  return {
    mails,
    otpFor(email) {
      const m = [...mails].reverse().find((x) => x.to === email && /verification code is/i.test(x.text));
      const code = m && m.text.match(/\b(\d{6})\b/);
      return code ? code[1] : null;
    },
    async settle() { await new Promise((r) => setTimeout(r, 30)); },
  };
}

module.exports = { installPendingFake, captureMail };
