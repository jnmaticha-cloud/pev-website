const express = require('express');
const { readDb, writeDb } = require('../data/store');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/', (req, res) => {
  const { name, email, message, phone } = req.body || {};

  const errors = {};
  if (!name || !name.trim()) errors.name = 'Name is required.';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'A valid email is required.';
  if (!message || !message.trim()) errors.message = 'Message is required.';

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Validation failed.', fields: errors });
  }

  const db = readDb();
  const entry = {
    id: `msg-${Date.now()}`,
    name: name.trim(),
    email: email.trim(),
    phone: phone ? phone.trim() : null,
    message: message.trim(),
    receivedAt: new Date().toISOString(),
  };
  db.contactMessages.push(entry);
  writeDb(db);

  res.status(201).json({ message: 'Thanks — your message has been received. We\'ll reply within one business day.', id: entry.id });
});

module.exports = router;
