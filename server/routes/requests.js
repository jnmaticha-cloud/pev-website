const express = require('express');
const { readDb, writeDb } = require('../data/store');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled'];
const VALID_TYPES = ['service', 'project'];

// All routes here require a logged-in client or company account.
router.use(requireAuth, requireRole('client', 'company'));

// List the current user's own requests. Optional ?type=service|project to filter.
router.get('/', (req, res) => {
  const db = readDb();
  let mine = db.serviceRequests.filter((r) => r.userId === req.user.sub);
  if (req.query.type) mine = mine.filter((r) => (r.type || 'service') === req.query.type);
  mine.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(mine);
});

// Submit a new request — for either a Service or a Project (two separate
// public catalogs; see /api/services and /api/projects). `service` holds
// the chosen item's title either way; `type` says which catalog it came from.
router.post('/', (req, res) => {
  const { service, details, type } = req.body || {};
  const resolvedType = VALID_TYPES.includes(type) ? type : 'service';
  const errors = {};
  if (!service || !service.trim()) errors.service = `Please select a ${resolvedType}.`;
  if (!details || !details.trim()) errors.details = 'Please describe what you need.';

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Validation failed.', fields: errors });
  }

  const db = readDb();
  const entry = {
    id: `req-${Date.now()}`,
    userId: req.user.sub,
    userName: req.user.name,
    userRole: req.user.role,
    type: resolvedType,
    service: service.trim(),
    details: details.trim(),
    status: 'pending',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.serviceRequests.push(entry);
  writeDb(db);

  res.status(201).json(entry);
});

module.exports = { router, VALID_STATUSES, VALID_TYPES };
