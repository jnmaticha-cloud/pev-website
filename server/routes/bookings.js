const express = require('express');
const { readDb, writeDb } = require('../data/store');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['pending', 'confirmed', 'cancelled'];

// Booking a consultation slot — client/company accounts only.
router.use(requireAuth, requireRole('client', 'company'));

router.get('/', (req, res) => {
  const db = readDb();
  const mine = db.bookings
    .filter((b) => b.userId === req.user.sub)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(mine);
});

router.post('/', (req, res) => {
  const { topic, preferredDate, preferredTime, notes } = req.body || {};
  const errors = {};
  if (!topic || !topic.trim()) errors.topic = 'Please give the booking a topic.';
  if (!preferredDate) errors.preferredDate = 'Please choose a preferred date.';

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Validation failed.', fields: errors });
  }

  const db = readDb();
  const entry = {
    id: `booking-${Date.now()}`,
    userId: req.user.sub,
    userName: req.user.name,
    userRole: req.user.role,
    topic: topic.trim(),
    preferredDate,
    preferredTime: preferredTime || null,
    notes: notes ? notes.trim() : '',
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.bookings.push(entry);
  writeDb(db);

  res.status(201).json(entry);
});

module.exports = { router, VALID_STATUSES };
