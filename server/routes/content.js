const express = require('express');
const { readDb } = require('../data/store');

const router = express.Router();

router.get('/services', (req, res) => {
  const db = readDb();
  res.json(db.services);
});

// Single service, looked up by its id ("svc-finance") or the short slug
// used in nav links and URLs ("finance" -> matches "svc-finance").
router.get('/services/:slug', (req, res) => {
  const db = readDb();
  const { slug } = req.params;
  const service = db.services.find(
    (s) => s.id === slug || s.id === `svc-${slug}` || s.id.replace(/^svc-/, '') === slug
  );
  if (!service) return res.status(404).json({ error: 'Service not found.' });
  res.json(service);
});

router.get('/projects', (req, res) => {
  const db = readDb();
  res.json(db.projects);
});

// "Team" is derived from staff (admin) accounts marked featured — it is no
// longer a standalone, unaccountable list. Only senior staff with a real
// login and featured:true show up here; junior/back-office staff accounts
// stay off the public site entirely.
router.get('/team', (req, res) => {
  const db = readDb();
  const team = db.users
    .filter((u) => u.role === 'admin' && u.featured)
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.title || 'Staff',
      category: u.category || null,
      bio: u.bio || '',
      photoUrl: u.photoUrl || null,
    }));
  res.json(team);
});

router.get('/directors', (req, res) => {
  const db = readDb();
  res.json(db.directors);
});

router.get('/gallery', (req, res) => {
  const db = readDb();
  const { category } = req.query;
  if (category && category !== 'All') {
    return res.json(db.gallery.filter((g) => g.category === category));
  }
  res.json(db.gallery);
});

router.get('/careers', (req, res) => {
  const db = readDb();
  res.json(db.careers);
});

router.get('/resources', (req, res) => {
  const db = readDb();
  res.json(db.resources);
});

// Homepage stat badges. Each field can be a fixed admin-entered value, or
// "auto" (computed live from real data) — controlled per-field by
// db.stats.auto, edited from Admin -> Site Content -> Homepage Stats.
function computeAutoStats(db) {
  const clientsServed = db.users.filter((u) => u.role === 'client' || u.role === 'company').length;

  const finishedRequests = db.serviceRequests.filter((r) => r.status === 'completed' || r.status === 'cancelled');
  const completed = db.serviceRequests.filter((r) => r.status === 'completed').length;
  const successRate = finishedRequests.length ? Math.round((completed / finishedRequests.length) * 100) : null;

  return {
    clientsServed: `${clientsServed}+`,
    successRate: successRate === null ? null : `${successRate}%`,
  };
}

router.get('/stats', (req, res) => {
  const db = readDb();
  const auto = db.stats.auto || {};
  const computed = computeAutoStats(db);

  const effective = { ...db.stats };
  delete effective.auto;

  if (auto.clientsServed) effective.clientsServed = computed.clientsServed;
  if (auto.successRate && computed.successRate !== null) effective.successRate = computed.successRate;

  res.json({ ...effective, auto });
});

router.get('/settings', (req, res) => {
  const db = readDb();
  res.json(db.settings);
});

router.get('/site-copy', (req, res) => {
  const db = readDb();
  res.json(db.siteCopy);
});

router.get('/core-values', (req, res) => {
  const db = readDb();
  res.json(db.coreValues);
});

module.exports = router;
