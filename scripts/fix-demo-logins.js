require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const Buyer = require("../models/Buyer");
const Admin = require("../models/Admin");

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const adminHash = bcrypt.hashSync("Admin@1234", 10);
  const admin = await Admin.findOneAndUpdate(
    { email: "admin@shaadisahulat.com" },
    {
      $set: {
        password_hash: adminHash,
        name: "Super Admin",
        admin_id: "admin_001",
      },
    },
    { upsert: true, new: true }
  );
  console.log(
    "admin reset",
    admin.email,
    bcrypt.compareSync("Admin@1234", admin.password_hash)
  );

  const hash = bcrypt.hashSync("Buyer@1234", 10);
  const buyers = [
    {
      buyer_id: "BUY-001",
      name: "Aisha Khan",
      email: "aisha@example.com",
      phone: "03001234567",
      city: "Lahore",
    },
    {
      buyer_id: "BUY-002",
      name: "Usman Ali",
      email: "usman@example.com",
      phone: "03119876543",
      city: "Karachi",
    },
    {
      buyer_id: "BUY-003",
      name: "Fatima Noor",
      email: "fatima@example.com",
      phone: "03217654321",
      city: "Islamabad",
    },
  ];

  for (const b of buyers) {
    const doc = await Buyer.findOneAndUpdate(
      { email: b.email },
      {
        $set: {
          ...b,
          password_hash: hash,
          dowry_done: true,
          level: "Bronze",
        },
        $setOnInsert: {
          wishlist_items: [],
          cart_items: [],
          recently_viewed_items: [],
          saved_addresses: [],
        },
      },
      { upsert: true, new: true }
    );
    console.log(
      "buyer upsert",
      doc.email,
      bcrypt.compareSync("Buyer@1234", doc.password_hash)
    );
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
