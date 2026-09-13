const express = require('express');
const bcrypt = require('bcryptjs');
const { readDb, writeDb } = require('../data/store');
const { signToken, requireAuth } = require('../middleware/auth');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PUBLIC_ROLES = ['client', 'company']; // 'admin' accounts are not self-registerable

// Descriptive-only job title for a COMPANY registrant — this says who they
// are at the business they represent. It does NOT grant any PEV staff
// permission; that list ('CEO', 'COO', ...) is intentionally the same set
// of everyday titles, but staff/admin accounts and their permissions are
// still only ever created by an existing admin (see /api/admin/staff).
const CONTACT_TITLES = ['CEO', 'COO', 'CFO', 'Accountant', 'Director', 'HR', 'Staff'];

router.post('/register', async (req, res) => {
  const { name, email, password, role, companyName, contactTitle } = req.body || {};
  const errors = {};

  if (!name || !name.trim()) errors.name = 'Name is required.';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'A valid email is required.';
  if (!password || password.length < 8) errors.password = 'Password must be at least 8 characters.';

  const accountRole = PUBLIC_ROLES.includes(role) ? role : 'client';
  if (accountRole === 'company') {
    if (!companyName || !companyName.trim()) errors.companyName = 'Company name is required for a business account.';
    if (!contactTitle || !CONTACT_TITLES.includes(contactTitle)) errors.contactTitle = 'Select your role at the company.';
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Validation failed.', fields: errors });
  }

  const db = readDb();
  const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  // Individual clients are active immediately. Company (business) accounts
  // go into a review queue first — an admin approves or rejects them from
  // Admin -> Company Accounts before the account can log in. This matches
  // how partner applications and email requests already work in this app.
  const needsApproval = accountRole === 'company';

  const passwordHash = await bcrypt.hash(password, 10);
  const user = {
    id: `user-${Date.now()}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role: accountRole,
    companyName: accountRole === 'company' ? companyName.trim() : null,
    contactTitle: accountRole === 'company' ? contactTitle : null,
    status: needsApproval ? 'pending' : 'active',
    createdAt: new Date().toISOString(),
  };
  db.users.push(user);
  writeDb(db);

  if (needsApproval) {
    return res.status(201).json({
      pending: true,
      message: 'Thanks — your company account has been submitted for review. We will email you once it is approved.',
    });
  }

  const token = signToken(user);
  res.status(201).json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, companyName: user.companyName, permissions: user.permissions || [], category: user.category || null },
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const db = readDb();
  const user = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status === 'pending') {
    return res.status(403).json({ error: 'Your company account is still awaiting approval. We will email you once it is reviewed.' });
  }
  if (user.status === 'rejected') {
    return res.status(403).json({ error: 'This account application was not approved. Contact us if you believe this is a mistake.' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, companyName: user.companyName || null, permissions: user.permissions || [], category: user.category || null },
  });
});

router.get('/me', requireAuth, (req, res) => {
  const db = readDb();
  const user = db.users.find((u) => u.id === req.user.sub);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role, companyName: user.companyName || null, permissions: user.permissions || [], category: user.category || null },
  });
});

module.exports = router;
