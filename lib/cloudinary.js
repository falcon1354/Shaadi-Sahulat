/**
 * Cloudinary client for ShaadiSahulat media.
 * Folder layout mirrors local Uploads/ + visual-ml-service/uploads/:
 *   shaadisahulat/products/{category}/{product_id}/…
 *   shaadisahulat/Categories/…
 *   shaadisahulat/Banners/…
 *   shaadisahulat/BNPL/{buyer}/{app}/…
 *   shaadisahulat/Dispute/{id}/…
 *   shaadisahulat/Reviews/…
 *   shaadisahulat/tryon/…
 */
const { v2: cloudinary } = require("cloudinary");

const ROOT = "shaadisahulat";

function configure() {
  const cloud_name = process.env.CLOUDINARY_CLOUD_NAME;
  const api_key = process.env.CLOUDINARY_API_KEY;
  const api_secret = process.env.CLOUDINARY_API_SECRET;
  if (!cloud_name || !api_key || !api_secret) {
    return false;
  }
  cloudinary.config({ cloud_name, api_key, api_secret, secure: true });
  return true;
}

function isConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Upload a Buffer to Cloudinary.
 * @param {Buffer} buffer
 * @param {object} opts
 * @param {string} opts.folder  folder under shaadisahulat/ (no leading slash)
 * @param {string} [opts.publicId]  optional public_id (without folder prefix)
 * @param {string} [opts.resourceType] image|raw|auto|video
 * @param {string} [opts.filename] original filename for format hint
 * @returns {Promise<{secure_url:string, public_id:string, resource_type:string, bytes:number}>}
 */
async function uploadBuffer(buffer, { folder, publicId, resourceType = "auto", filename } = {}) {
  if (!configure()) {
    throw new Error("Cloudinary is not configured (missing CLOUDINARY_* env vars)");
  }
  const assetFolder = folder.startsWith(ROOT) ? folder : `${ROOT}/${folder}`.replace(/\/+/g, "/");

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        asset_folder: assetFolder,
        use_asset_folder_as_public_id_prefix: true,
        public_id: publicId || undefined,
        resource_type: resourceType,
        overwrite: Boolean(publicId),
        unique_filename: !publicId,
        use_filename: Boolean(filename),
        filename_override: filename || undefined,
      },
      (err, result) => {
        if (err) return reject(err);
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          resource_type: result.resource_type,
          bytes: result.bytes,
          format: result.format,
        });
      }
    );
    stream.end(buffer);
  });
}

async function uploadFile(filePath, { folder, publicId, resourceType = "auto" } = {}) {
  if (!configure()) {
    throw new Error("Cloudinary is not configured (missing CLOUDINARY_* env vars)");
  }
  const assetFolder = folder.startsWith(ROOT) ? folder : `${ROOT}/${folder}`.replace(/\/+/g, "/");
  const result = await cloudinary.uploader.upload(filePath, {
    asset_folder: assetFolder,
    use_asset_folder_as_public_id_prefix: true,
    public_id: publicId || undefined,
    resource_type: resourceType,
    overwrite: Boolean(publicId),
  });
  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
    resource_type: result.resource_type,
    bytes: result.bytes,
    format: result.format,
  };
}

module.exports = {
  ROOT,
  cloudinary,
  configure,
  isConfigured,
  uploadBuffer,
  uploadFile,
};
