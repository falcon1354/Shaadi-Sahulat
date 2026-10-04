/**
 * Phase 2I — frontend changes: bank officer token storage, private evidence links,
 * no prefilled demo credentials, no legacy auth calls.
 * Run: npm run test:frontend
 */

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

const ROOT = path.resolve(__dirname, "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

class MemStorage {
  constructor() { this.m = new Map(); }
  getItem(k) { return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
  clear() { this.m.clear(); }
  get length() { return this.m.size; }
}
globalThis.localStorage = new MemStorage();
globalThis.sessionStorage = new MemStorage();

const OUT = path.join(ROOT, "node_modules", ".cache", "ss-auth-tests", `phase2i-${process.pid}.cjs`);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
test.after(() => { try { fs.unlinkSync(OUT); } catch { /* ignore */ } });

function loadBankApi() {
  esbuild.buildSync({
    entryPoints: [path.join(ROOT, "src/api/bankApi.js")],
    bundle: true, platform: "node", format: "cjs", outfile: OUT, logLevel: "error",
  });
  delete require.cache[require.resolve(OUT)];
  return require(OUT);
}

test("bank officer token lives in sessionStorage; an old localStorage copy is purged on load", () => {
  localStorage.setItem("ss_bank_officer", JSON.stringify({ token: "old-persisted" }));
  const bankApi = loadBankApi();
  assert.equal(localStorage.getItem("ss_bank_officer"), null, "legacy persistent copy removed");
  bankApi.saveOfficerToStorage({ token: "t1", officer: { name: "O" } });
  assert.equal(localStorage.length, 0, "nothing written to localStorage");
  assert.deepEqual(bankApi.getOfficerFromStorage(), { token: "t1", officer: { name: "O" } });
  bankApi.clearOfficerFromStorage();
  assert.equal(bankApi.getOfficerFromStorage(), null);
});

test("bank login page has no prefilled or displayed demo credentials", () => {
  const src = read("src/components/Bank/BankLoginPage.jsx");
  assert.ok(!/bank123|officer@bank\.com/.test(src));
  assert.match(src, /useState\(""\);\s*\r?\n\s*const \[password, setPassword\] = useState\(""\)/);
});

test("dispute evidence links use the signed url from the API, never raw storage paths", () => {
  const src = stripComments(read("src/components/Disputes/DisputeChatPage.jsx"));
  assert.ok(!src.includes("/uploads/"), "no direct /uploads links");
  assert.match(src, /const evidenceUrl = \(e\) => \(e\.url \?/);
  assert.ok(!/e\.file_path/.test(src), "file_path is not used");
});

test("BNPL / bank document links are backend-relative signed urls (unchanged components)", () => {
  for (const f of ["src/components/BNPL/BNPLStatusPage.jsx", "src/components/Bank/BankDashboardPage.jsx"]) {
    const src = read(f);
    assert.match(src, /href=\{`http:\/\/localhost:5000\$\{d\.url\}`\}/, f);
  }
});

test("no frontend code calls the removed legacy auth endpoints", () => {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jsx?|tsx?)$/.test(e.name)) files.push(p);
    }
  })(path.join(ROOT, "src"));
  const offenders = files.filter((f) =>
    /\/api\/(buyer|seller|admin)\/(login|register)\b|\$\{BASE(_URL)?\}\/(login|register)\b/.test(stripComments(fs.readFileSync(f, "utf8")))
      && !f.endsWith(path.join("api", "bankApi.js"))); // bank officer login is its own, still-supported flow
  assert.deepEqual(offenders.map((f) => path.relative(ROOT, f)), []);
});
