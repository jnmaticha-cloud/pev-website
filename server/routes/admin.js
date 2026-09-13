const express = require('express');
const bcrypt = require('bcryptjs');
const { readDb, writeDb } = require('../data/store');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { VALID_STATUSES } = require('./requests');
const { VALID_STATUSES: MAIL_STATUSES } = require('./emailRequests');
const { getSentLog } = require('../utils/mailer');
const { serviceRequestStatusEmail, emailRequestStatusEmail } = require('../utils/emailTemplates');
const { notifyUser } = require('../utils/notify');
const { STAFF_CATEGORIES, ALL_PERMISSIONS, defaultPermissionsForCategory, sanitizePermissions } = require('../utils/permissions');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Everything under /api/admin requires an authenticated admin. Individual
// routes below layer requirePermission(...) on top for finer-grained
// access — a CEO/COO account has every permission, so nothing here ever
// blocks the top of the org chart; an Accountant or HR account only
// reaches what their category grants.
router.use(requireAuth, requireRole('admin'));

// Summary KPIs stay available to any staff account — it's an overview, not
// sensitive data by itself, and every admin page links back to it.
router.get('/summary', (req, res) => {
  const db = readDb();
  res.json({
    totalUsers: db.users.filter((u) => u.role !== 'admin').length,
    totalClients: db.users.filter((u) => u.role === 'client').length,
    totalCompanies: db.users.filter((u) => u.role === 'company').length,
    totalMessages: db.contactMessages.length,
    totalServices: db.services.length,
    totalProjects: db.projects.length,
    totalCareers: db.careers.length,
    totalRequests: db.serviceRequests.length,
    pendingRequests: db.serviceRequests.filter((r) => r.status === 'pending').length,
    totalPartnerApplications: db.partnerApplications.length,
    pendingPartnerApplications: db.partnerApplications.filter((p) => p.status === 'pending').length,
  });
});

router.get('/messages', requirePermission('messages'), (req, res) => {
  const db = readDb();
  res.json(db.contactMessages.slice().reverse());
});

// All registered client/company accounts (never expose passwordHash).
// Anyone with 'users' permission gets the full account-management view;
// 'invoices' also unlocks this same list because creating an invoice
// requires picking which client/company it's for — it's the same data,
// just needed for a narrower reason.
router.get('/users', requirePermission('users', 'invoices'), (req, res) => {
  const db = readDb();
  const users = db.users
    .filter((u) => u.role !== 'admin')
    .map(({ id, name, email, role, companyName, createdAt }) => ({ id, name, email, role, companyName, createdAt }));
  res.json(users);
});

// Staff (admin) accounts — list, create, update profile, remove. Admin
// accounts are never self-registerable through the public /register form;
// only an existing admin with 'staff' permission can create another one.
//
// title/category/bio/photoUrl/featured are the same fields that power the
// public "Team" section (see /api/team in content.js) — only accounts with
// featured:true and a real login show up there. `category` also drives the
// account's DEFAULT permissions (see utils/permissions.js) — the actual
// rights are stored per-account in `permissions` and can be customized
// beyond that default.
router.get('/staff', requirePermission('staff'), (req, res) => {
  const db = readDb();
  const staff = db.users
    .filter((u) => u.role === 'admin')
    .map(({ id, name, email, title, category, permissions, bio, photoUrl, featured, createdAt }) => ({
      id, name, email, title: title || null, category: category || 'Staff',
      permissions: permissions || [], bio: bio || '',
      photoUrl: photoUrl || null, featured: !!featured, createdAt,
    }));
  res.json(staff);
});

router.get('/staff/categories', requirePermission('staff'), (req, res) => {
  res.json(STAFF_CATEGORIES);
});

router.get('/permissions', requirePermission('staff'), (req, res) => {
  res.json(ALL_PERMISSIONS);
});

router.post('/staff', requirePermission('staff'), async (req, res) => {
  const { name, email, password, title, category, bio, featured, permissions } = req.body || {};
  const errors = {};
  if (!name || !name.trim()) errors.name = 'Name is required.';
  if (!email || !EMAIL_RE.test(email)) errors.email = 'A valid email is required.';
  if (!password || password.length < 8) errors.password = 'Password must be at least 8 characters.';
  if (category && !STAFF_CATEGORIES.includes(category)) {
    errors.category = `Category must be one of: ${STAFF_CATEGORIES.join(', ')}.`;
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Validation failed.', fields: errors });
  }

  const db = readDb();
  const existing = db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'An account with this email already exists.' });
  }

  const resolvedCategory = category || 'Staff';
  const customPermissions = sanitizePermissions(permissions);

  const passwordHash = await bcrypt.hash(password, 10);
  const staffUser = {
    id: `user-${Date.now()}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash,
    role: 'admin',
    companyName: null,
    title: title ? title.trim() : null,
    category: resolvedCategory,
    permissions: customPermissions !== null ? customPermissions : defaultPermissionsForCategory(resolvedCategory),
    bio: bio ? bio.trim() : '',
    photoUrl: null,
    featured: !!featured,
    createdAt: new Date().toISOString(),
  };
  db.users.push(staffUser);
  writeDb(db);

  const { passwordHash: _drop, ...safeStaffUser } = staffUser;
  res.status(201).json(safeStaffUser);
});

// Update a staff member's profile fields and/or permissions. Deliberately
// does not allow changing email/password here (use the login flow for that).
router.patch('/staff/:id', requirePermission('staff'), (req, res) => {
  const { title, category, bio, photoUrl, featured, permissions } = req.body || {};
  if (category !== undefined && !STAFF_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Category must be one of: ${STAFF_CATEGORIES.join(', ')}.` });
  }
  let sanitizedPerms;
  if (permissions !== undefined) {
    sanitizedPerms = sanitizePermissions(permissions);
    if (sanitizedPerms === null) {
      return res.status(400).json({ error: 'permissions must be an array of valid permission keys.' });
    }
  }

  const db = readDb();
  const staffUser = db.users.find((u) => u.id === req.params.id && u.role === 'admin');
  if (!staffUser) {
    return res.status(404).json({ error: 'Staff account not found.' });
  }

  if (title !== undefined) staffUser.title = title ? title.trim() : null;
  if (category !== undefined) staffUser.category = category;
  if (bio !== undefined) staffUser.bio = bio.trim();
  if (photoUrl !== undefined) staffUser.photoUrl = photoUrl || null;
  if (featured !== undefined) staffUser.featured = !!featured;
  if (sanitizedPerms !== undefined) staffUser.permissions = sanitizedPerms;

  writeDb(db);
  const { passwordHash: _drop, ...safeStaffUser } = staffUser;
  res.json(safeStaffUser);
});

// Remove a staff account. An admin can never delete their own account this
// way, to avoid a team accidentally locking itself out entirely.
router.delete('/staff/:id', requirePermission('staff'), (req, res) => {
  const db = readDb();
  if (req.params.id === req.user.sub) {
    return res.status(400).json({ error: 'You cannot remove your own admin account.' });
  }
  const idx = db.users.findIndex((u) => u.id === req.params.id && u.role === 'admin');
  if (idx === -1) {
    return res.status(404).json({ error: 'Staff account not found.' });
  }
  const remainingAdmins = db.users.filter((u) => u.role === 'admin').length;
  if (remainingAdmins <= 1) {
    return res.status(400).json({ error: 'Cannot remove the last remaining admin account.' });
  }
  const [removed] = db.users.splice(idx, 1);
  writeDb(db);
  res.json({ deleted: true, id: removed.id });
});

// All requests (service AND project type) across every client/company, newest first.
router.get('/requests', requirePermission('requests'), (req, res) => {
  const db = readDb();
  let all = db.serviceRequests.slice();
  if (req.query.type) all = all.filter((r) => (r.type || 'service') === req.query.type);
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(all);
});

// Update a request's status (pending -> in_progress -> completed / cancelled).
router.patch('/requests/:id', requirePermission('requests'), async (req, res) => {
  const { status } = req.body || {};
  if (!VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const db = readDb();
  const reqItem = db.serviceRequests.find((r) => r.id === req.params.id);
  if (!reqItem) {
    return res.status(404).json({ error: 'Service request not found.' });
  }

  const statusChanged = reqItem.status !== status;
  reqItem.status = status;
  reqItem.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json(reqItem);

  // Notify the client/company after responding — a slow or failed
  // notification should never delay or break the status update itself.
  if (statusChanged) {
    const owner = db.users.find((u) => u.id === reqItem.userId);
    if (owner) {
      const { subject, text } = serviceRequestStatusEmail({ name: owner.name, service: reqItem.service, status });
      notifyUser({ userId: owner.id, email: owner.email, subject, text }).catch(() => {});
    }
  }
});

// Official email requests — submitted by any client/company/staff account,
// reviewed and approved/denied here by an admin.
router.get('/email-requests', requirePermission('email_requests'), (req, res) => {
  const db = readDb();
  const all = db.emailRequests.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(all);
});

router.patch('/email-requests/:id', requirePermission('email_requests'), async (req, res) => {
  const { status, adminNote } = req.body || {};
  if (status !== undefined && !MAIL_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${MAIL_STATUSES.join(', ')}` });
  }

  const db = readDb();
  const entry = db.emailRequests.find((r) => r.id === req.params.id);
  if (!entry) {
    return res.status(404).json({ error: 'Email request not found.' });
  }

  const statusChanged = status !== undefined && entry.status !== status;
  if (status !== undefined) entry.status = status;
  if (adminNote !== undefined) entry.adminNote = adminNote ? adminNote.trim() : null;
  entry.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json(entry);

  if (statusChanged) {
    const { subject, text } = emailRequestStatusEmail({
      name: entry.userName,
      status: entry.status,
      adminNote: entry.adminNote,
      requestedAddress: entry.requestedAddress,
    });
    notifyUser({ userId: entry.userId, email: entry.userEmail, subject, text }).catch(() => {});
  }
});

// Recent notification log — shows what the system has sent (or would have
// sent, if SMTP isn't configured) so admins can verify the notification
// system is working even without a mail server hooked up yet.
router.get('/notifications', requirePermission('reports'), (req, res) => {
  res.json(getSentLog());
});

module.exports = router;
