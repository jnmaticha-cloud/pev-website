const express = require('express');
const { readDb, writeDb } = require('../data/store');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { notifyUser } = require('../utils/notify');

const router = express.Router();

router.use(requireAuth, requireRole('admin'), requirePermission('users'));

function toPublicShape(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    companyName: u.companyName,
    contactTitle: u.contactTitle,
    status: u.status,
    createdAt: u.createdAt,
  };
}

// Pending + recently-decided company registrations (company accounts only —
// individual clients are active immediately and never appear here).
router.get('/', (req, res) => {
  const db = readDb();
  const rows = db.users
    .filter((u) => u.role === 'company')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(toPublicShape);
  res.json(rows);
});

router.patch('/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "status must be 'active' or 'rejected'." });
  }

  const db = readDb();
  const user = db.users.find((u) => u.id === req.params.id && u.role === 'company');
  if (!user) return res.status(404).json({ error: 'Company account not found.' });

  user.status = status;
  writeDb(db);

  const subject = status === 'active'
    ? 'Your Prime Elite Ventures company account has been approved'
    : 'Update on your Prime Elite Ventures company account application';
  const text = status === 'active'
    ? `Hi ${user.name},\n\nGood news — your company account for ${user.companyName} has been approved. You can now log in and start submitting requests.\n\n— Prime Elite Ventures`
    : `Hi ${user.name},\n\nWe were not able to approve the company account application for ${user.companyName} at this time. Reply to this email if you have questions.\n\n— Prime Elite Ventures`;

  notifyUser({ userId: user.id, email: user.email, subject, text }).catch(() => {});

  res.json(toPublicShape(user));
});

module.exports = router;
