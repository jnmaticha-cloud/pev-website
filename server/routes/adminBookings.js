const express = require('express');
const { readDb, writeDb } = require('../data/store');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { VALID_STATUSES } = require('./bookings');
const { notifyUser } = require('../utils/notify');

const router = express.Router();

router.use(requireAuth, requireRole('admin'), requirePermission('bookings'));

router.get('/', (req, res) => {
  const db = readDb();
  const all = db.bookings.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(all);
});

router.patch('/:id', (req, res) => {
  const { status } = req.body || {};
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const db = readDb();
  const booking = db.bookings.find((b) => b.id === req.params.id);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });

  const statusChanged = status !== undefined && booking.status !== status;
  if (status !== undefined) booking.status = status;
  booking.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json(booking);

  if (statusChanged) {
    const owner = db.users.find((u) => u.id === booking.userId);
    if (owner) {
      const verb = booking.status === 'confirmed' ? 'confirmed' : booking.status === 'cancelled' ? 'cancelled' : 'updated';
      const subject = `Your consultation booking is ${verb}`;
      const text =
        `Hi ${owner.name},\n\n` +
        `Your booking for "${booking.topic}" (preferred date: ${booking.preferredDate}${booking.preferredTime ? ' at ' + booking.preferredTime : ''}) has been ${verb}.\n\n` +
        `— Prime Elite Ventures`;
      notifyUser({ userId: owner.id, email: owner.email, subject, text }).catch(() => {});
    }
  }
});

module.exports = router;
