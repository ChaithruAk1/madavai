// © 2026 Samskruthi Harish. Madav — Proprietary. All rights reserved. See LICENSE.
//
// TEMPLATE for the LOCAL ADMIN ROSTER. Copy this file to `admin-roster.cjs` in the
// same folder and fill in the emails. The real `admin-roster.cjs` is git-ignored and
// excluded from the packaged installer, so it lives ONLY on the admin's machine — a
// code-level fallback that stays in your control even if the server account is hacked.
//
//   admins        → shown as "Creator", full admin, always keep every feature
//   complimentary → shown as "Complimentary", free access, excluded from subscription/checkout
//
// Emails are matched case-insensitively. Restart Madav after editing.

module.exports = {
  admins: [
    // "owner@example.com",
  ],
  complimentary: [
    // "friend@example.com",
  ],
};
