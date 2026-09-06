/**
 * fixCategories.js — Run once to fix decoration + miscellaneous subcategories.
 *   cd backend && node seeds/fixCategories.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const mongoose      = require("mongoose");
const AdminCategory = require("../models/AdminCategory");

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

async function fix() {
  await mongoose.connect(MONGO_URI);
  console.log("Connected.\n");

  // Fix decoration subcategories (rename flowers→artificial_flowers, add missing ones)
  const dec = await AdminCategory.findOneAndUpdate(
    { category_id: "decoration" },
    {
      $set: {
        subcategories: [
          { id: "lights",             label: "Lights / Fairy Lights", price_min: null, price_max: null, custom_fields: [] },
          { id: "artificial_flowers", label: "Artificial Flowers",    price_min: null, price_max: null, custom_fields: [] },
          { id: "stage_setup",        label: "Stage Setup Materials", price_min: null, price_max: null, custom_fields: [] },
          { id: "wall_decor",         label: "Wall Decor",            price_min: null, price_max: null, custom_fields: [] },
          { id: "table_centerpieces", label: "Table Centerpieces",    price_min: null, price_max: null, custom_fields: [] },
        ],
      },
    },
    { new: true }
  );
  console.log(dec ? "decoration fixed." : "decoration not found — run seedAdmin.js first.");

  // Fix miscellaneous: add wedding_services subcategory
  const misc = await AdminCategory.findOneAndUpdate(
    { category_id: "miscellaneous" },
    {
      $set: {
        subcategories: [
          { id: "small_appliances", label: "Small Appliances", price_min: null, price_max: null,
            custom_fields: [
              { field_id: "brand",   label: "Brand",   type: "text",   options: [], required: false },
              { field_id: "wattage", label: "Wattage", type: "number", options: [], required: false },
            ]},
          { id: "wedding_services", label: "Wedding Services", price_min: null, price_max: null, custom_fields: [] },
        ],
      },
    },
    { new: true }
  );
  console.log(misc ? "miscellaneous fixed." : "miscellaneous not found — run seedAdmin.js first.");

  await mongoose.disconnect();
  console.log("\nDone.");
}

fix().catch(e => { console.error(e.message); process.exit(1); });
