const express = require('express');
const { readDb, writeDb } = require('../data/store');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_STATUSES = ['pending', 'approved', 'rejected'];

// Public: anyone interested in becoming a partner can apply — no account
// needed, same as the contact form and job applications.
router.post('/apply', (req, res) => {
  const { name, email, phone, organization, partnershipType, message } = req.body || {};
  const errors = {};
  if (!name || !name.trim()) errors.name = 'Name is required.';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'A valid email is required.';
  if (!message || !message.trim()) errors.message = 'Please describe the partnership you have in mind.';

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Validation failed.', fields: errors });
  }

  const db = readDb();
  const entry = {
    id: `partner-${Date.now()}`,
    name: name.trim(),
    email: email.trim(),
    phone: phone ? phone.trim() : null,
    organization: organization ? organization.trim() : null,
    partnershipType: partnershipType ? partnershipType.trim() : null,
    message: message.trim(),
    status: 'pending',
    adminNote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.partnerApplications.push(entry);
  writeDb(db);

  res.status(201).json({ message: "Thanks for your interest — we'll review your application and be in touch.", id: entry.id });
});

module.exports = { router, VALID_STATUSES };
