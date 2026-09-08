/**
 * Dispute & Order Confirmation SLAs (from condensed dispute spec).
 * All durations in milliseconds unless noted.
 */

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const SLA = {
  BUYER_AUTO_COMPLETE_DAYS: 7,
  BUYER_REMINDER_DAY: 3,
  BUYER_FINAL_WARNING_DAY: 6,
  SELLER_RESPONSE_HOURS: 48,
  BUYER_EVIDENCE_HOURS: 24,
  SELLER_EVIDENCE_HOURS: 24,
  ADMIN_RESOLUTION_DAYS: 5,
  BUYER_RETURN_SHIP_DAYS: 7,
  SELLER_RETURN_CONFIRM_DAYS: 3,
  APPEAL_WINDOW_DAYS: 7,
  ADMIN_URGENT_DAYS: 3,
  ADMIN_CRITICAL_DAYS: 5,
};

const DISPUTE_CATEGORIES = [
  { id: "not_received", label: "Not received", code: "NOT_RECEIVED", buyerEvidenceRequired: false },
  { id: "item_not_as_described", label: "Item not as described", code: "ITEM_NOT_AS_DESCRIBED", buyerEvidenceRequired: true },
  { id: "damaged", label: "Damaged or defective", code: "DAMAGED_OR_DEFECTIVE", buyerEvidenceRequired: true },
  { id: "wrong", label: "Wrong item sent", code: "WRONG_ITEM_SENT", buyerEvidenceRequired: true },
  { id: "missing", label: "Missing parts / incomplete", code: "MISSING_PARTS_OR_INCOMPLETE", buyerEvidenceRequired: true },
  { id: "quality_issue", label: "Quality issue", code: "QUALITY_ISSUE", buyerEvidenceRequired: true },
  { id: "other", label: "Other", code: "OTHER", buyerEvidenceRequired: true },
  // legacy aliases kept for older records
  { id: "poor_quality", label: "Quality issue (legacy)", code: "QUALITY_ISSUE", buyerEvidenceRequired: true },
];

const DISPUTE_STATUS = {
  OPEN: "OPEN",
  SELLER_RESPONSE_PENDING: "SELLER_RESPONSE_PENDING",
  SELLER_RESPONDED: "SELLER_RESPONDED",
  BUYER_REVIEW_PENDING: "BUYER_REVIEW_PENDING",
  ADMIN_REVIEW_PENDING: "ADMIN_REVIEW_PENDING",
  UNDER_REVIEW: "UNDER_REVIEW", // legacy
  RESOLVED: "RESOLVED",
  CANCELLED: "CANCELLED",
  APPEALED: "APPEALED",
};

const SELLER_ACTIONS = [
  { id: "accept_full_refund", label: "Accept Full Refund" },
  { id: "offer_partial_refund", label: "Offer Partial Refund" },
  { id: "offer_replacement", label: "Offer Replacement" },
  { id: "reject_dispute", label: "Reject Dispute (escalate)" },
];

const ADMIN_OUTCOMES = [
  { id: "buyer_wins_full", label: "Buyer Wins — Full Refund", closesAs: "CLOSED_BUYER_WINS_FULL_REFUND" },
  { id: "buyer_wins_partial", label: "Buyer Wins — Partial Refund", closesAs: "CLOSED_BUYER_WINS_PARTIAL_REFUND" },
  { id: "buyer_wins_return", label: "Buyer Wins — Return Required", closesAs: "CLOSED_BUYER_WINS_RETURN_REQUIRED" },
  { id: "seller_wins", label: "Seller Wins", closesAs: "CLOSED_SELLER_WINS" },
  { id: "compromise", label: "Compromise", closesAs: "CLOSED_COMPROMISE" },
  { id: "force_replacement", label: "Force Replacement", closesAs: "CLOSED_REPLACEMENT" },
];

function addMs(date, ms) {
  return new Date(new Date(date).getTime() + ms);
}

function sellerResponseDeadline(openedAt = new Date()) {
  return addMs(openedAt, SLA.SELLER_RESPONSE_HOURS * HOUR);
}

function autoCompleteDeadline(deliveredAt) {
  if (!deliveredAt) return null;
  return addMs(deliveredAt, SLA.BUYER_AUTO_COMPLETE_DAYS * DAY);
}

function adminResolutionDeadline(escalatedAt = new Date()) {
  return addMs(escalatedAt, SLA.ADMIN_RESOLUTION_DAYS * DAY);
}

function appealDeadline(resolvedAt = new Date()) {
  return addMs(resolvedAt, SLA.APPEAL_WINDOW_DAYS * DAY);
}

function remainingMs(deadline) {
  if (!deadline) return null;
  return Math.max(0, new Date(deadline).getTime() - Date.now());
}

function formatDuration(ms) {
  if (ms == null) return "—";
  if (ms <= 0) return "Expired";
  const totalSec = Math.floor(ms / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (days > 0) return `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m`;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function urgencyLevel(deadline) {
  const left = remainingMs(deadline);
  if (left == null) return "none";
  if (left <= 0) return "expired";
  if (left <= DAY) return "critical";
  if (left <= 2 * DAY) return "urgent";
  return "ok";
}

function buildSlaSnapshot(dispute = {}, order = {}) {
  const now = Date.now();
  const snap = {
    seller_response_deadline: dispute.seller_response_deadline || null,
    seller_response_remaining_ms: remainingMs(dispute.seller_response_deadline),
    seller_response_label: `Seller has ${SLA.SELLER_RESPONSE_HOURS}h to respond`,
    admin_resolution_deadline: dispute.admin_resolution_deadline || null,
    admin_resolution_remaining_ms: remainingMs(dispute.admin_resolution_deadline),
    admin_resolution_label: `Admin must resolve within ${SLA.ADMIN_RESOLUTION_DAYS} days`,
    appeal_deadline: dispute.appeal_deadline || null,
    appeal_remaining_ms: remainingMs(dispute.appeal_deadline),
    auto_complete_deadline: order.auto_complete_at || autoCompleteDeadline(order.delivered_at),
    auto_complete_remaining_ms: remainingMs(order.auto_complete_at || autoCompleteDeadline(order.delivered_at)),
    auto_complete_label: `Order auto-completes in ${SLA.BUYER_AUTO_COMPLETE_DAYS} days if no action`,
    buyer_evidence_hours: SLA.BUYER_EVIDENCE_HOURS,
    seller_evidence_hours: SLA.SELLER_EVIDENCE_HOURS,
    return_ship_days: SLA.BUYER_RETURN_SHIP_DAYS,
    return_confirm_days: SLA.SELLER_RETURN_CONFIRM_DAYS,
    now,
  };
  snap.primary_deadline = null;
  snap.primary_label = "";
  snap.primary_remaining_ms = null;

  if (["SELLER_RESPONSE_PENDING", "OPEN"].includes(dispute.status) && snap.seller_response_deadline) {
    snap.primary_deadline = snap.seller_response_deadline;
    snap.primary_label = "Seller response window";
    snap.primary_remaining_ms = snap.seller_response_remaining_ms;
  } else if (["ADMIN_REVIEW_PENDING", "UNDER_REVIEW"].includes(dispute.status) && snap.admin_resolution_deadline) {
    snap.primary_deadline = snap.admin_resolution_deadline;
    snap.primary_label = "Admin resolution SLA";
    snap.primary_remaining_ms = snap.admin_resolution_remaining_ms;
  } else if (order.status === "DELIVERED" && !order.buyer_confirmed_receipt && snap.auto_complete_deadline) {
    snap.primary_deadline = snap.auto_complete_deadline;
    snap.primary_label = "Auto-complete countdown";
    snap.primary_remaining_ms = snap.auto_complete_remaining_ms;
  }

  snap.primary_formatted = formatDuration(snap.primary_remaining_ms);
  snap.urgency = urgencyLevel(snap.primary_deadline);
  return snap;
}

function categoryRequiresBuyerEvidence(type) {
  const cat = DISPUTE_CATEGORIES.find((c) => c.id === type);
  return cat ? !!cat.buyerEvidenceRequired : true;
}

module.exports = {
  SLA,
  HOUR,
  DAY,
  DISPUTE_CATEGORIES,
  DISPUTE_STATUS,
  SELLER_ACTIONS,
  ADMIN_OUTCOMES,
  addMs,
  sellerResponseDeadline,
  autoCompleteDeadline,
  adminResolutionDeadline,
  appealDeadline,
  remainingMs,
  formatDuration,
  urgencyLevel,
  buildSlaSnapshot,
  categoryRequiresBuyerEvidence,
};
