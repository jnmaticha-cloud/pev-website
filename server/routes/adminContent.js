const express = require('express');
const { readDb, writeDb } = require('../data/store');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('admin'));

// Whitelisted editable collections, each with its id prefix and required fields.
// Note: "team" is deliberately NOT here — it's derived from staff accounts
// (see /api/team and server/routes/admin.js's /staff routes) rather than
// being its own free-floating list, so every public team profile is tied
// to a real login.
const COLLECTIONS = {
  services: { prefix: 'svc', required: ['title', 'icon', 'summary', 'category'] },
  projects: { prefix: 'proj', required: ['title', 'icon', 'summary', 'category'] },
  directors: { prefix: 'd', required: ['name', 'role'] },
  gallery: { prefix: 'g', required: ['category', 'title'] },
  careers: { prefix: 'c', required: ['title', 'location', 'type'] },
  coreValues: { prefix: 'val', required: ['title', 'description'] },
  resources: { prefix: 'res', required: ['title', 'description'] },
  announcements: { prefix: 'ann', required: ['text'] },
};

// Whitelisted editable singleton objects (one record, not a list).
const SINGLETONS = ['settings', 'siteCopy', 'stats'];

function validateCollection(req, res, next) {
  const def = COLLECTIONS[req.params.collection];
  if (!def) {
    return res.status(404).json({ error: `Unknown content collection "${req.params.collection}".` });
  }
  req.collectionDef = def;
  next();
}

router.get('/content/:collection', requirePermission('content'), validateCollection, (req, res) => {
  const db = readDb();
  res.json(db[req.params.collection]);
});

router.post('/content/:collection', requirePermission('content'), validateCollection, (req, res) => {
  const db = readDb();
  const body = req.body || {};
  const missing = req.collectionDef.required.filter((f) => !body[f] || !String(body[f]).trim());
  if (missing.length) {
    return res.status(400).json({ error: 'Validation failed.', fields: Object.fromEntries(missing.map((f) => [f, `${f} is required.`])) });
  }

  const entry = { id: `${req.collectionDef.prefix}-${Date.now()}`, ...body };
  db[req.params.collection].push(entry);
  writeDb(db);
  res.status(201).json(entry);
});

router.put('/content/:collection/:id', requirePermission('content'), validateCollection, (req, res) => {
  const db = readDb();
  const list = db[req.params.collection];
  const idx = list.findIndex((item) => item.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found.' });

  const body = req.body || {};
  const missing = req.collectionDef.required.filter((f) => body[f] !== undefined && !String(body[f]).trim());
  if (missing.length) {
    return res.status(400).json({ error: 'Validation failed.', fields: Object.fromEntries(missing.map((f) => [f, `${f} cannot be empty.`])) });
  }

  list[idx] = { ...list[idx], ...body, id: list[idx].id };
  writeDb(db);
  res.json(list[idx]);
});

router.delete('/content/:collection/:id', requirePermission('content'), validateCollection, (req, res) => {
  const db = readDb();
  const list = db[req.params.collection];
  const idx = list.findIndex((item) => item.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Item not found.' });

  const [removed] = list.splice(idx, 1);
  writeDb(db);
  res.json({ deleted: true, item: removed });
});

// Site-wide singleton objects: settings (contact/socials), siteCopy
// (hero/about/footer text), stats (hero stat badges) — one record each,
// not a list.
router.get('/singleton/:name', requirePermission('content'), (req, res) => {
  if (!SINGLETONS.includes(req.params.name)) {
    return res.status(404).json({ error: `Unknown settings object "${req.params.name}".` });
  }
  const db = readDb();
  res.json(db[req.params.name]);
});

router.put('/singleton/:name', requirePermission('content'), (req, res) => {
  if (!SINGLETONS.includes(req.params.name)) {
    return res.status(404).json({ error: `Unknown settings object "${req.params.name}".` });
  }
  const db = readDb();
  db[req.params.name] = { ...db[req.params.name], ...(req.body || {}) };
  writeDb(db);
  res.json(db[req.params.name]);
});

// Back-compat alias — /settings behaves exactly like /singleton/settings.
router.get('/settings', requirePermission('content'), (req, res) => {
  const db = readDb();
  res.json(db.settings);
});

router.put('/settings', requirePermission('content'), (req, res) => {
  const db = readDb();
  db.settings = { ...db.settings, ...(req.body || {}) };
  writeDb(db);
  res.json(db.settings);
});

module.exports = router;
