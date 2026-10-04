/**
 * seedAdmin.js — Run once from backend/
 *   node seeds/seedAdmin.js
 *
 * Creates the admin account (credentials from ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD
 * or an interactive prompt — never hardcoded) + seeds AdminCategory collection
 * with the 6 existing categories and their default price ranges.
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose      = require("mongoose");
const crypto        = require("crypto");
const Buyer         = require("../models/Buyer");
const { hashPassword } = require("../lib/passwords");
const { resolveAdminSeedCredentials } = require("../lib/seedCredentials");
const Admin         = require("../models/Admin");
const AdminCategory = require("../models/AdminCategory");
const { isRetiredCategory } = require("../lib/retiredCategories");

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

const DEFAULT_CATEGORIES = [
  {
    category_id: "wedding_dress",
    label: "Wedding Dress", icon: "👗",
    price_min: 15000, price_max: 200000,
    subcategories: [
      { id: "bridal",       label: "Bridal",      custom_fields: [
        { field_id: "fabric",         label: "Fabric",         type: "select", options: ["Silk","Net","Organza","Chiffon","Velvet","Georgette"], required: false },
        { field_id: "embroidery",     label: "Embroidery Type",type: "select", options: ["Zardozi","Gota","Mirror Work","Dabka","Tilla","Kora"],  required: false },
        { field_id: "color",          label: "Color",          type: "text",   required: true },
        { field_id: "size",           label: "Size",           type: "select", options: ["XS","S","M","L","XL","XXL","Custom"], required: false },
        { field_id: "embroidery_density", label: "Embroidery Density", type: "select", options: ["Light","Medium","Heavy"], required: false },
      ]},
      { id: "groom",        label: "Groom",       custom_fields: [
        { field_id: "fabric", label: "Fabric", type: "select", options: ["Wool","Silk","Cotton","Linen"], required: false },
        { field_id: "color",  label: "Color",  type: "text",   required: true },
        { field_id: "size",   label: "Size",   type: "select", options: ["S","M","L","XL","XXL","Custom"], required: false },
      ]},
    ],
  },
  {
    category_id: "furniture",
    label: "Furniture", icon: "🛋️",
    price_min: 5000, price_max: 300000,
    subcategories: [
      { id: "sofa_set",       label: "Sofa Set",       custom_fields: [
        { field_id: "material", label: "Material", type: "select", options: ["Fabric","Leather","Velvet","Rexine"], required: false },
        { field_id: "seating", label: "Seating Capacity", type: "select", options: ["3-seater","5-seater","6-seater","L-shape"], required: false },
        { field_id: "color",   label: "Color",    type: "text", required: false },
      ]},
      { id: "bed_set",        label: "Bed Set",        custom_fields: [
        { field_id: "size",    label: "Bed Size",  type: "select", options: ["Single","Double","King","Queen"], required: false },
        { field_id: "material",label: "Material",  type: "select", options: ["Solid Wood","MDF","Sheesham","Ply"], required: false },
      ]},
      { id: "dining_table",   label: "Dining Table",   custom_fields: [] },
      { id: "dressing_table", label: "Dressing Table", custom_fields: [] },
      { id: "wardrobe",       label: "Wardrobe",       custom_fields: [] },
    ],
  },
  {
    category_id: "electronics",
    label: "Electronics", icon: "📺",
    price_min: 3000, price_max: 200000,
    subcategories: [
      { id: "led_tv",         label: "LED TV",           custom_fields: [
        { field_id: "brand",    label: "Brand",    type: "select", options: ["Samsung","LG","Sony","Haier","TCL","Hisense"], required: false },
        { field_id: "size_inch",label: "Screen Size (inches)", type: "number", required: false },
        { field_id: "smart",    label: "Smart TV", type: "select", options: ["Yes","No"], required: false },
      ]},
      { id: "refrigerator",    label: "Refrigerator",    custom_fields: [
        { field_id: "brand",   label: "Brand",    type: "select", options: ["Haier","PEL","Dawlance","Orient","Samsung"], required: false },
        { field_id: "capacity",label: "Capacity", type: "text",   required: false },
      ]},
      { id: "washing_machine", label: "Washing Machine", custom_fields: [] },
      { id: "ac",              label: "Air Conditioner",  custom_fields: [] },
    ],
  },
  {
    category_id: "kitchen_items",
    label: "Kitchen Items", icon: "🍳",
    price_min: 500, price_max: 80000,
    subcategories: [
      { id: "large_appliances", label: "Large Appliances", custom_fields: [
        { field_id: "brand",  label: "Brand",  type: "text",   required: false },
        { field_id: "wattage",label: "Wattage",type: "number", required: false },
      ]},
      { id: "general_kitchen",  label: "General Kitchen", custom_fields: [
        { field_id: "material", label: "Material", type: "select", options: ["Stainless Steel","Bone China","Ceramic","Plastic","Glass"], required: false },
        { field_id: "pieces",   label: "No. of Pieces", type: "number", required: false },
      ]},
    ],
  },
  {
    category_id: "decoration",
    label: "Decoration", icon: "✨",
    price_min: 500, price_max: 100000,
    subcategories: [
      { id: "lights",             label: "Lights / Fairy Lights",  custom_fields: [] },
      { id: "artificial_flowers", label: "Artificial Flowers",     custom_fields: [] },
      { id: "stage_setup",        label: "Stage Setup Materials",  custom_fields: [] },
      { id: "wall_decor",         label: "Wall Decor",             custom_fields: [] },
      { id: "table_centerpieces", label: "Table Centerpieces",     custom_fields: [] },
    ],
  },
  {
    category_id: "miscellaneous",
    label: "Miscellaneous", icon: "🎁",
    price_min: 500, price_max: 50000,
    subcategories: [
      { id: "small_appliances", label: "Small Appliances", custom_fields: [
        { field_id: "brand",  label: "Brand",  type: "text",   required: false },
        { field_id: "wattage",label: "Wattage",type: "number", required: false },
      ]},
      { id: "wedding_services", label: "Wedding Services", custom_fields: [] },
    ],
  },
];

async function seed() {
  // Credentials come from ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD or an interactive
  // prompt — never from source. Resolved BEFORE touching the database (fail fast).
  const { email, password, name } = await resolveAdminSeedCredentials();

  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB.\n");

  // Create the admin only if it does not exist (an existing admin is never modified;
  // change its password through POST /api/auth/change-password).
  const exists = await Admin.findOne({ email }).select("_id").lean();
  if (!exists) {
    const [buyerClash, sellerClash] = await Promise.all([
      Buyer.findOne({ email }).select("_id").lean(),
      mongoose.connection.collection("sellers").findOne({ email }, { projection: { _id: 1 } }),
    ]);
    if (buyerClash || sellerClash) {
      throw new Error("That email already belongs to a buyer or seller account (one email = one role). Choose another ADMIN_SEED_EMAIL.");
    }
    const adminId = (await Admin.findOne({ admin_id: "admin_001" }).select("_id").lean())
      ? `admin_${crypto.randomBytes(6).toString("hex")}`
      : "admin_001";
    const now = new Date();
    await Admin.create({
      admin_id:      adminId,
      name,
      email,
      password_hash: await hashPassword(password),
      auth: { email_verified: true, token_version: 0, failed_logins: 0, password_changed_at: now },
    });
    console.log(`Created admin: ${email} (${adminId})`);
  } else {
    console.log(`Admin ${email} already exists — skipped (password unchanged).`);
  }

  // Seed categories
  let seeded = 0;
  for (const cat of DEFAULT_CATEGORIES) {
    await AdminCategory.findOneAndUpdate(
      { category_id: cat.category_id },
      { $setOnInsert: cat },
      { upsert: true }
    );
    seeded++;
  }
  console.log(`Seeded ${seeded} categories into admin_categories.`);

  const allCats = await AdminCategory.find({}).lean();
  const retiredIds = allCats
    .filter((c) => isRetiredCategory(c.category_id, c.label))
    .map((c) => c._id);
  if (retiredIds.length) {
    const retired = await AdminCategory.deleteMany({ _id: { $in: retiredIds } });
    console.log(`Removed ${retired.deletedCount} retired categor${retired.deletedCount === 1 ? "y" : "ies"} (jewelry / accessories / second-hand).`);
  }

  await mongoose.disconnect();
  console.log("\nDone.");
}

seed().catch(async (e) => {
  console.error(`[seedAdmin] ${e.message}`);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
