/**
 * migrate-original-dataset.js — restore the ORIGINAL ShaadiSahulat FYP dataset recovered from
 * Git history (exports/*.json at commit 8009ad4, deleted in f114a9d).
 *
 *   node scripts/migrate-original-dataset.js --check            validate only — performs NO writes
 *   node scripts/migrate-original-dataset.js                    insert (requires ORIGINAL_SELLER_PASSWORD)
 *
 * Options:
 *   --data-dir <dir>        folder with seller_products.json, sellers.json, dress_catalog.json
 *                           (default: scripts/original-dataset)
 *   --exclude <product_id>  skip a product (repeatable)
 *   IMAGE_BASE=<url>        if set, --check also verifies every primary image is reachable at
 *                           IMAGE_BASE + primary_image_url
 *
 * Rules:
 *   - Insert-only. Never updates, replaces or deletes existing documents. No --drop.
 *   - Aborts before ANY write if validation fails (ID/email clashes, broken seller references,
 *     unknown categories, bad data). Exactly the validated set is written.
 *   - Original values are preserved: _id, product_id, titles, descriptions, prices, categories,
 *     conditions, seller references, image paths, embeddings, timestamps.
 *   - Added fields (current-schema requirements, following seeds/migrateToThrift.js steps 2–3,
 *     WITHOUT its step 1 "Used"→"Thrift" rename, so conditions stay original):
 *       marketplace_type "thrift" for condition Thrift/Like New/Used (plus is_final_sale: true,
 *       admin_approval_status: "approved"); otherwise "new".
 *   - Seller credentials: original password hashes are public in the repository, so they are NOT
 *     imported. SELLER_001 (owner of the catalogue) gets a new hash of ORIGINAL_SELLER_PASSWORD;
 *     the other two sellers get password_hash null (cannot log in).
 *   - Every inserted document gets restored_from: "git:8009ad4:exports" for traceability/rollback.
 * Creates no orders, payments, BNPL applications, disputes, admins or buyers.
 * Never prints passwords or hashes.
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { hashPassword, validatePasswordPolicy } = require("../lib/passwords");

const SOURCE_TAG = "git:8009ad4:exports";
const CATALOG_OWNER = "SELLER_001";
const THRIFT_CONDITIONS = ["Thrift", "Like New", "Used"];
const VALID_CONDITIONS = ["New", "Like New", "Used", "Thrift"];

const args = process.argv.slice(2);
const CHECK_ONLY = args.includes("--check");
const dataDir = args.includes("--data-dir") ? args[args.indexOf("--data-dir") + 1] : path.join(__dirname, "original-dataset");
const excluded = new Set(args.flatMap((a, i) => (a === "--exclude" ? [args[i + 1]] : [])));
// --skip-seller <seller_id>: do not import that seller (allowed only if it owns no imported product).
const skippedSellers = new Set(args.flatMap((a, i) => (a === "--skip-seller" ? [args[i + 1]] : [])));

const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);
const oid = (hex) => new mongoose.Types.ObjectId(String(hex));
const date = (v) => (v ? new Date(v) : v);

function load(name) {
  const rows = JSON.parse(fs.readFileSync(path.join(dataDir, name), "utf8"));
  if (!Array.isArray(rows)) throw new Error(`${name} is not an array`);
  return rows;
}

function mapProduct(p) {
  const thrift = THRIFT_CONDITIONS.includes(p.condition);
  return {
    ...p,
    _id: oid(p._id),
    created_at: date(p.created_at),
    updated_at: date(p.updated_at),
    images: (p.images || []).map((im) => ({ ...im, uploaded_at: date(im.uploaded_at) })),
    marketplace_type: thrift ? "thrift" : "new",
    ...(thrift ? { is_final_sale: true, admin_approval_status: "approved" } : {}),
    restored_from: SOURCE_TAG,
  };
}

function mapSeller(s, ownerHash, now) {
  const isOwner = s.seller_id === CATALOG_OWNER;
  return {
    ...s,
    _id: oid(s._id),
    email: String(s.email).trim().toLowerCase(),
    created_at: date(s.created_at),
    updated_at: date(s.updated_at),
    password_hash: isOwner ? ownerHash : null,
    auth: isOwner
      ? { email_verified: true, email_verified_at: now, token_version: 0, failed_logins: 0, password_changed_at: now }
      : { email_verified: false, token_version: 0, failed_logins: 0 }, // password_hash null => cannot log in
    restored_from: SOURCE_TAG,
  };
}

function mapDress(d) {
  return { ...d, _id: oid(d._id), indexed_at: date(d.indexed_at), restored_from: SOURCE_TAG };
}

(async () => {
  const rawProducts = load("seller_products.json").filter((p) => !excluded.has(p.product_id));
  const allSellers = load("sellers.json");
  const rawSellers = allSellers.filter((s) => !skippedSellers.has(s.seller_id));
  const rawDress = load("dress_catalog.json");
  for (const id of excluded) if (!load("seller_products.json").some((p) => p.product_id === id)) fail(`--exclude ${id}: no such product`);
  for (const id of skippedSellers) {
    if (!allSellers.some((s) => s.seller_id === id)) fail(`--skip-seller ${id}: no such seller`);
    if (rawProducts.some((p) => p.seller_id === id)) fail(`--skip-seller ${id}: seller owns imported products`);
  }
  const expectP = Number(process.env.EXPECT_PRODUCTS || NaN), expectS = Number(process.env.EXPECT_SELLERS || NaN);
  if (!Number.isNaN(expectP) && rawProducts.length !== expectP) fail(`expected ${expectP} products, got ${rawProducts.length}`);
  if (!Number.isNaN(expectS) && rawSellers.length !== expectS) fail(`expected ${expectS} sellers, got ${rawSellers.length}`);
  console.log(`excluded products: ${[...excluded].join(",") || "none"}; skipped sellers: ${[...skippedSellers].join(",") || "none"}`);

  // ── Offline validation of the dataset itself ─────────────────────────────
  const dup = (a) => a.filter((v, i) => a.indexOf(v) !== i);
  for (const [label, arr] of [["product_id", rawProducts.map((p) => p.product_id)], ["product _id", rawProducts.map((p) => p._id)],
    ["seller_id", rawSellers.map((s) => s.seller_id)], ["seller email", rawSellers.map((s) => String(s.email).toLowerCase())],
    ["dress product_id", rawDress.map((d) => d.product_id)], ["dress _id", rawDress.map((d) => d._id)]]) {
    if (dup(arr).length) fail(`duplicate ${label}: ${dup(arr).join(",")}`);
  }
  const sellerIds = new Set(rawSellers.map((s) => s.seller_id));
  for (const p of rawProducts) {
    if (!/^[0-9a-f]{24}$/.test(p._id)) fail(`${p.product_id}: bad _id`);
    if (!sellerIds.has(p.seller_id)) fail(`${p.product_id}: unknown seller ${p.seller_id}`);
    if (!VALID_CONDITIONS.includes(p.condition)) fail(`${p.product_id}: bad condition ${p.condition}`);
    if (!(Number(p.price) > 0)) fail(`${p.product_id}: bad price`);
    if (!p.title || !p.major_category) fail(`${p.product_id}: missing title/category`);
    const prim = (p.images || []).find((i) => i.is_primary) || (p.images || [])[0];
    if (!prim || p.primary_image_url !== `/images/${prim.relative_path}`) fail(`${p.product_id}: primary_image_url does not match its image record`);
  }
  if (!rawSellers.some((s) => s.seller_id === CATALOG_OWNER)) fail(`catalogue owner ${CATALOG_OWNER} missing`);

  // ── Optional image reachability check ────────────────────────────────────
  const imageBase = String(process.env.IMAGE_BASE || "").replace(/\/$/, "");
  if (imageBase) {
    let bad = 0;
    for (const p of rawProducts) {
      const r = await fetch(imageBase + p.primary_image_url, { method: "HEAD" }).catch(() => null);
      const ct = r?.headers.get("content-type") || "";
      if (!r || r.status !== 200 || !ct.startsWith("image/")) { bad++; fail(`${p.product_id}: image not reachable (${r?.status} ${ct})`); }
    }
    console.log(`images checked at ${imageBase}: ${rawProducts.length - bad}/${rawProducts.length} reachable`);
  } else {
    warn("IMAGE_BASE not set — image reachability not checked");
  }

  // ── Database checks (read-only) ──────────────────────────────────────────
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  if (db.databaseName !== "shaadi-sahulat") fail(`unexpected database ${db.databaseName}`);
  const cats = await db.collection("admincategories").find({}, { projection: { category_id: 1, is_active: 1, subcategories: 1 } }).toArray();
  const catMap = new Map(cats.map((c) => [c.category_id, c]));
  for (const p of rawProducts) {
    const c = catMap.get(p.major_category);
    if (!c) fail(`${p.product_id}: category ${p.major_category} not in admincategories`);
    else if (!(c.subcategories || []).some((s) => s.id === p.subcategory)) warn(`${p.product_id} "${p.title}": subcategory ${p.major_category}/${p.subcategory} not in admincategories (visible under the category tab, not under a subcategory filter)`);
  }
  const products = rawProducts.map(mapProduct);
  const dress = rawDress.map(mapDress);
  const clash = async (col, filter) => (await db.collection(col).countDocuments(filter));
  const c1 = await clash("seller_products", { $or: [{ product_id: { $in: products.map((p) => p.product_id) } }, { _id: { $in: products.map((p) => p._id) } }] });
  const c2 = await clash("sellers", { $or: [{ seller_id: { $in: rawSellers.map((s) => s.seller_id) } }, { _id: { $in: rawSellers.map((s) => oid(s._id)) } }, { email: { $in: rawSellers.map((s) => String(s.email).toLowerCase()) } }] });
  const c3 = await clash("dress_catalog", { $or: [{ product_id: { $in: dress.map((d) => d.product_id) } }, { _id: { $in: dress.map((d) => d._id) } }] });
  const emails = rawSellers.map((s) => String(s.email).toLowerCase());
  const c4 = (await clash("admins", { email: { $in: emails } })) + (await clash("buyers", { email: { $in: emails } }));
  if (c1) fail(`${c1} product(s) already exist (product_id/_id)`);
  if (c2) fail(`${c2} seller(s) already exist (seller_id/_id/email)`);
  if (c3) fail(`${c3} dress_catalog entr(ies) already exist`);
  if (c4) fail(`${c4} seller email(s) already used by an admin or buyer`);

  // ── Report ───────────────────────────────────────────────────────────────
  const tally = (arr, f) => arr.reduce((a, x) => ((a[f(x)] = (a[f(x)] || 0) + 1), a), {});
  const visibleNew = products.filter((p) => p.marketplace_type === "new" && p.availability_status === "available");
  console.log(`database: ${db.databaseName}`);
  console.log(`planned inserts: seller_products=${products.length}, sellers=${rawSellers.length}, dress_catalog=${dress.length}; updates=0; deletes=0`);
  console.log(`  marketplace_type: ${JSON.stringify(tally(products, (p) => p.marketplace_type))}  availability: ${JSON.stringify(tally(products, (p) => p.availability_status))}`);
  console.log(`  visible in main marketplace (new+available) by category: ${JSON.stringify(tally(visibleNew, (p) => p.major_category))}`);
  console.log(`  visible on Thrift page: ${products.filter((p) => p.marketplace_type === "thrift" && p.availability_status === "available").length}`);
  for (const c of cats.filter((x) => x.is_active !== false)) if (!visibleNew.some((p) => p.major_category === c.category_id)) warn(`category tab ${c.category_id} would have no visible new products`);
  console.log(`  sellers: ${rawSellers.map((s) => `${s.seller_id}(${s.seller_id === CATALOG_OWNER ? "login: new random password" : "login disabled"})`).join(", ")}`);
  for (const w of warnings) console.log(`WARNING: ${w}`);
  if (problems.length) {
    for (const p of problems) console.log(`FAIL: ${p}`);
    throw new Error(`validation failed (${problems.length} problem(s)) — nothing written`);
  }
  console.log("validation OK");
  if (CHECK_ONLY) { await mongoose.disconnect(); console.log("check only — nothing written"); return; }

  // ── Writes (only after full validation) ──────────────────────────────────
  const password = process.env.ORIGINAL_SELLER_PASSWORD || "";
  const owner = rawSellers.find((s) => s.seller_id === CATALOG_OWNER);
  if (!validatePasswordPolicy(password, { email: owner.email }).ok) throw new Error("ORIGINAL_SELLER_PASSWORD missing or fails the password policy — nothing written");
  const now = new Date();
  const ownerHash = await hashPassword(password);
  const sellers = rawSellers.map((s) => mapSeller(s, ownerHash, now));
  const r1 = await db.collection("sellers").insertMany(sellers, { ordered: true });
  const r2 = await db.collection("seller_products").insertMany(products, { ordered: true });
  const r3 = await db.collection("dress_catalog").insertMany(dress, { ordered: true });
  console.log(`inserted: sellers=${r1.insertedCount}, seller_products=${r2.insertedCount}, dress_catalog=${r3.insertedCount}`);
  await mongoose.disconnect();
})().catch(async (e) => {
  console.error(`[migrate-original-dataset] ${e.message}`);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
