/**
 * BnplDocumentBundle — a SINGLE consolidated record per BNPL application
 * that holds ALL the file metadata together (CNIC front, CNIC back,
 * utility bill), rather than one BnplDocument row per file.
 *
 * Introduced per spec: "consolidate into a single document record holding
 * all file metadata together". The legacy per-file BnplDocument model is
 * kept alongside for backwards compatibility, but new lookups by
 * application should prefer BnplDocumentBundle.
 */
const mongoose = require("mongoose");

const fileMetaSchema = new mongoose.Schema({
  file_path:     { type: String, default: "" },
  original_name: { type: String, default: "" },
  mime_type:     { type: String, default: "" },
  ocr_raw_text:  { type: String, default: "" },
  ocr_extracted_cnic: { type: String, default: "" },
  ocr_confidence:     { type: Number, default: 0 },
  uploaded_at:   { type: Date,   default: () => new Date() },
}, { _id: false });

const bundleSchema = new mongoose.Schema(
  {
    application_id: { type: String, required: true, unique: true, index: true },
    buyer_id:       { type: String, required: true, index: true },
    cnic_front:     { type: fileMetaSchema, default: () => ({}) },
    cnic_back:      { type: fileMetaSchema, default: () => ({}) },
    utility_bill:   { type: fileMetaSchema, default: () => ({}) },
    ocr_completed_at: { type: Date, default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model(
  "BnplDocumentBundle",
  bundleSchema,
  "bnpl_document_bundles"
);
