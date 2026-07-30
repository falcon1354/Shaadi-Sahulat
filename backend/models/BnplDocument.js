/**
 * BNPL uploaded document — one row per file (CNIC front, CNIC back, utility bill).
 *
 * File paths are RELATIVE to the BNPL uploads root so the entire folder can
 * be moved without DB updates. The OCR pipeline stores `ocr_extracted_cnic`
 * alongside the buyer-entered CNIC in BnplUser so the bank officer's
 * verification workbench can show both side-by-side with a mismatch warning.
 */
const mongoose = require("mongoose");

const bnplDocumentSchema = new mongoose.Schema(
  {
    application_id:     { type: String, required: true, index: true },
    buyer_id:           { type: String, required: true, index: true },
    doc_type:           {
      type: String,
      enum: ["cnic_front", "cnic_back", "utility_bill", "dispute_evidence"],
      required: true,
    },
    file_path:          { type: String, required: true },  // relative path under uploads/bnpl/
    original_name:      { type: String, default: "" },
    mime_type:          { type: String, default: "" },
    ocr_raw_text:       { type: String, default: "" },
    ocr_extracted_cnic: { type: String, default: "" },
    ocr_confidence:     { type: Number, default: 0 },
    ocr_completed_at:   { type: Date,   default: null },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model(
  "BnplDocument",
  bnplDocumentSchema,
  "bnpl_documents"
);
