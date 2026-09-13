const express = require('express');
const { readDb, writeDb } = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['pending', 'approved', 'denied'];

// Any authenticated account — client, company, or staff — can request an
// official @primeeliteventures.example mailbox once their account is active
// (accounts are active immediately on login in this system; there is no
// separate account-approval step). The request itself still needs an
// admin's sign-off before it's considered approved.
router.use(requireAuth);

router.get('/', (req, res) => {
  const db = readDb();
  const mine = db.emailRequests
    .filter((r) => r.userId === req.user.sub)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(mine);
});

router.post('/', (req, res) => {
  const { requestedAddress, reason } = req.body || {};
  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Validation failed.', fields: { reason: 'Please explain what the mailbox is for.' } });
  }

  const db = readDb();
  const entry = {
    id: `mail-${Date.now()}`,
    userId: req.user.sub,
    userName: req.user.name,
    userEmail: req.user.email,
    userRole: req.user.role,
    requestedAddress: requestedAddress ? requestedAddress.trim() : null,
    reason: reason.trim(),
    status: 'pending',
    adminNote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.emailRequests.push(entry);
  writeDb(db);

  res.status(201).json(entry);
});

module.exports = { router, VALID_STATUSES };
