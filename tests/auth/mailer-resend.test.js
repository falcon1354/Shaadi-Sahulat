/**
 * Resend transport: unit tests against a LOCAL fake of the Resend API (no real email, no network).
 * Run: node --test tests/auth/mailer-resend.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("http");

const KEY = "re_test_key_do_not_leak_123";
let server, base, calls, script;

function startFake() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        calls.push({ url: req.url, auth: req.headers.authorization, idem: req.headers["idempotency-key"], body: JSON.parse(body || "{}") });
        const step = script.shift() || { status: 200, json: { id: "fake-id" } };
        res.writeHead(step.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(step.json));
      });
    }).listen(0, "127.0.0.1", () => { base = `http://127.0.0.1:${server.address().port}`; resolve(); });
  });
}

test.before(async () => { calls = []; script = []; await startFake(); });
test.after(() => server.close());
test.beforeEach(() => {
  calls = []; script = [];
  Object.assign(process.env, { EMAIL_TRANSPORT: "resend", RESEND_API_KEY: KEY, RESEND_FROM: "ShaadiSahulat <no-reply@example.com>", RESEND_API_BASE: base });
  delete process.env.RESEND_REPLY_TO;
});
test.afterEach(() => { for (const k of ["EMAIL_TRANSPORT","RESEND_API_KEY","RESEND_FROM","RESEND_API_BASE","RESEND_REPLY_TO"]) delete process.env[k]; });

const mailer = () => { delete require.cache[require.resolve("../../lib/mailer")]; return require("../../lib/mailer"); };
const msg = { to: "buyer@example.com", subject: "Your code", text: "Your code is 123456", html: "<p>123456</p>" };

test("transportMode recognises resend and rejects unknown values", () => {
  const m = mailer();
  assert.equal(m.transportMode({ EMAIL_TRANSPORT: "resend" }), "resend");
  assert.equal(m.transportMode({ EMAIL_TRANSPORT: "RESEND " }), "resend");
  assert.equal(m.transportMode({ EMAIL_TRANSPORT: "sendgrid" }), "invalid");
  assert.equal(m.transportMode({ EMAIL_TRANSPORT: "smtp" }), "smtp");
});

test("sends the right request: auth header, from, to array, idempotency key", async () => {
  script.push({ status: 200, json: { id: "abc-123" } });
  const r = await mailer().sendMail(msg);
  assert.deepEqual([r.delivered, r.transport, r.messageId], [true, "resend", "abc-123"]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/emails");
  assert.equal(calls[0].auth, `Bearer ${KEY}`);
  assert.ok(calls[0].idem);
  assert.equal(calls[0].body.from, "ShaadiSahulat <no-reply@example.com>");
  assert.deepEqual(calls[0].body.to, ["buyer@example.com"]);
  assert.equal(calls[0].body.subject, "Your code");
  assert.equal(calls[0].body.text, msg.text);
});

test("reply_to is sent only when RESEND_REPLY_TO is set", async () => {
  process.env.RESEND_REPLY_TO = "help@example.com";
  await mailer().sendMail(msg);
  assert.equal(calls[0].body.reply_to, "help@example.com");
});

test("missing config fails loudly with variable names only; nothing is sent", async () => {
  delete process.env.RESEND_FROM;
  await assert.rejects(mailer().sendMail(msg), (e) => e.code === "ECONFIG" && /RESEND_FROM/.test(e.message) && !e.message.includes(KEY));
  assert.equal(calls.length, 0);
});

test("401/403/422 are not retried and the error never contains key, body or OTP", async () => {
  script.push({ status: 403, json: { name: "validation_error", message: "The example.org domain is not verified." } });
  const m = mailer();
  await assert.rejects(m.sendMail(msg), (e) => {
    const text = m.describeSmtpError(e);
    assert.equal(e.responseCode, 403);
    assert.ok(!text.includes(KEY) && !text.includes("123456"));
    assert.match(text, /RESEND_API_KEY/);
    return true;
  });
  assert.equal(calls.length, 1);
});

test("retries once on 429/5xx with the same idempotency key, then succeeds", async () => {
  script.push({ status: 429, json: { name: "rate_limit_exceeded", message: "slow down" } });
  script.push({ status: 200, json: { id: "second-try" } });
  const r = await mailer().sendMail(msg);
  assert.equal(r.messageId, "second-try");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].idem, calls[1].idem);
});

test("gives up after one retry", async () => {
  script.push({ status: 500, json: { message: "boom" } }, { status: 500, json: { message: "boom" } });
  await assert.rejects(mailer().sendMail(msg), (e) => e.responseCode === 500);
  assert.equal(calls.length, 2);
});

test("sendMailSafely never throws and logs a masked, body-free line", async () => {
  script.push({ status: 401, json: { name: "restricted_api_key", message: "API key is invalid" } });
  const logs = [];
  const orig = console.error; console.error = (...a) => logs.push(a.join(" "));
  try {
    const r = await mailer().sendMailSafely(msg);
    assert.equal(r.delivered, false);
  } finally { console.error = orig; }
  const out = logs.join("\n");
  assert.ok(!out.includes(KEY) && !out.includes("123456") && !out.includes("buyer@example.com"));
  assert.match(out, /bu\*\*\*@example\.com/);
});

test("verifyTransport(resend) never claims delivery is verified and makes no request", async () => {
  const r = await mailer().verifyTransport();
  assert.equal(r.ok, true);
  assert.match(r.status, /NOT yet verified/);
  assert.equal(calls.length, 0);
  delete process.env.RESEND_API_KEY;
  const bad = await mailer().verifyTransport();
  assert.equal(bad.ok, false);
  assert.match(bad.detail, /RESEND_API_KEY/);
});

test("resend.dev sender produces a warning", () => {
  const st = mailer().resendConfigStatus({ RESEND_API_KEY: KEY, RESEND_FROM: "onboarding@resend.dev" });
  assert.ok(st.warnings.some((w) => /resend\.dev/.test(w)));
});

test("injected test transport still wins (existing OTP tests keep working)", async () => {
  const m = mailer(); const got = [];
  m.setMailTransport((x) => got.push(x));
  await m.sendMail(msg);
  m.setMailTransport(null);
  assert.equal(got.length, 1);
  assert.equal(calls.length, 0);
});
