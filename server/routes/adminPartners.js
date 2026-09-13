const express = require('express');
const { readDb, writeDb } = require('../data/store');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { VALID_STATUSES } = require('./partners');
const { notifyUser } = require('../utils/notify');

const router = express.Router();

router.use(requireAuth, requireRole('admin'), requirePermission('partners'));

router.get('/', (req, res) => {
  const db = readDb();
  const all = db.partnerApplications.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(all);
});

router.patch('/:id', (req, res) => {
  const { status, adminNote } = req.body || {};
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const db = readDb();
  const entry = db.partnerApplications.find((p) => p.id === req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Partner application not found.' });
  }

  const statusChanged = status !== undefined && entry.status !== status;
  if (status !== undefined) entry.status = status;
  if (adminNote !== undefined) entry.adminNote = adminNote ? adminNote.trim() : null;
  entry.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json(entry);

  // Partner applicants generally have no account (they applied publicly,
  // like a job applicant), so this is email-only — no in-app notification.
  if (statusChanged) {
    const verb = entry.status === 'approved' ? 'approved' : entry.status === 'rejected' ? 'not moving forward' : 'updated';
    const subject = `Your partnership application: ${verb}`;
    const text =
      `Hi ${entry.name},\n\n` +
      `Thank you for your interest in partnering with Prime Elite Ventures. Your application has been ${verb === 'not moving forward' ? verb : verb}.\n` +
      (entry.adminNote ? `\nNote from our team: ${entry.adminNote}\n` : '') +
      `\n— Prime Elite Ventures`;
    notifyUser({ email: entry.email, subject, text }).catch(() => {});
  }
});

module.exports = router;
