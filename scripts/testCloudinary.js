/**
 * Smoke-test Cloudinary credentials and folder upload.
 * Run: node scripts/testCloudinary.js
 */
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const { isConfigured, uploadBuffer, ROOT } = require("../lib/cloudinary");

async function main() {
  if (!isConfigured()) {
    console.error("Cloudinary env vars missing");
    process.exit(1);
  }
  // 1x1 PNG
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const result = await uploadBuffer(png, {
    folder: "Categories",
    publicId: "_cloudinary_smoke_test",
    filename: "smoke.png",
    resourceType: "image",
  });
  console.log("OK root=", ROOT);
  console.log("secure_url=", result.secure_url);
  console.log("public_id=", result.public_id);
}

main().catch((e) => {
  console.error("FAIL", e.message || e);
  process.exit(1);
});
