/**
 * Dispute access rule shared by the HTTP routes (routes/disputes.js) and the
 * Socket.IO layer (lib/socket.js), so both enforce exactly the same policy.
 *
 * Allowed: the dispute's buyer, its seller, or any admin.
 * `user` must be a VERIFIED identity (req.user / socket.user) — never client input.
 */

function isDisputeParticipant(dispute, user) {
  if (!dispute || !user) return false;
  return user.role === "admin" ||
    (user.role === "buyer" && dispute.buyer_id === user.id) ||
    (user.role === "seller" && dispute.seller_id === user.id);
}

module.exports = { isDisputeParticipant };
