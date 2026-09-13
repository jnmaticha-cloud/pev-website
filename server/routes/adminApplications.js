const express = require('express');
const path = require('path');
const fs = require('fs');
const { readDb, writeDb } = require('../data/store');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { sendMail } = require('../utils/mailer');
const { applicationStatusEmail } = require('../utils/emailTemplates');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'resumes');

router.use(requireAuth, requireRole('admin'), requirePermission('applications'));

function effectiveScore(app) {
  return app.adminScore !== null && app.adminScore !== undefined ? app.adminScore : app.autoScore;
}

function withoutStoredName({ resumeStoredName, ...rest }) {
  return rest;
}

// List all applications, ranked by effective score (admin override wins over auto-score).
// Optional ?jobId=xxx to filter to one posting.
router.get('/', (req, res) => {
  const db = readDb();
  let apps = db.applications;
  if (req.query.jobId) {
    apps = apps.filter((a) => a.jobId === req.query.jobId);
  }
  const ranked = apps
    .slice()
    .sort((a, b) => effectiveScore(b) - effectiveScore(a))
    .map((a, i) => ({ ...withoutStoredName(a), rank: i + 1, effectiveScore: effectiveScore(a) }));
  res.json(ranked);
});

// Per-job summary: applicant count, average score, and the top candidate.
router.get('/summary', (req, res) => {
  const db = readDb();
  const byJob = {};
  db.careers.forEach((job) => {
    byJob[job.id] = { jobId: job.id, jobTitle: job.title, count: 0, averageScore: 0, topCandidate: null };
  });

  db.applications.forEach((a) => {
    if (!byJob[a.jobId]) {
      byJob[a.jobId] = { jobId: a.jobId, jobTitle: a.jobTitle, count: 0, averageScore: 0, topCandidate: null };
    }
    byJob[a.jobId].count += 1;
  });

  Object.values(byJob).forEach((entry) => {
    const apps = db.applications.filter((a) => a.jobId === entry.jobId);
    if (apps.length) {
      const total = apps.reduce((sum, a) => sum + effectiveScore(a), 0);
      entry.averageScore = Math.round(total / apps.length);
      const top = apps.slice().sort((a, b) => effectiveScore(b) - effectiveScore(a))[0];
      entry.topCandidate = { name: top.name, score: effectiveScore(top) };
    }
  });

  res.json(Object.values(byJob));
});

// Update an application's admin-override score and/or hiring status.
router.patch('/:id', (req, res) => {
  const { adminScore, status } = req.body || {};
  const VALID_STATUSES = ['new', 'reviewed', 'shortlisted', 'rejected', 'hired'];

  const db = readDb();
  const app = db.applications.find((a) => a.id === req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found.' });

  if (adminScore !== undefined) {
    if (adminScore !== null && (isNaN(Number(adminScore)) || Number(adminScore) < 0 || Number(adminScore) > 100)) {
      return res.status(400).json({ error: 'adminScore must be a number between 0 and 100, or null to clear it.' });
    }
    app.adminScore = adminScore === null ? null : Number(adminScore);
  }
  const statusChanged = status !== undefined && app.status !== status;
  if (status !== undefined) {
    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }
    app.status = status;
  }

  writeDb(db);
  res.json({ ...withoutStoredName(app), effectiveScore: effectiveScore(app) });

  // Only email on a genuine status change — not on a score-only override,
  // and not if the status was resubmitted unchanged.
  if (statusChanged) {
    const { subject, text } = applicationStatusEmail({ name: app.name, jobTitle: app.jobTitle, status: app.status });
    sendMail({ to: app.email, subject, text }).catch(() => {});
  }
});

// Download an applicant's resume — admin-only, never publicly served.
router.get('/:id/resume', (req, res) => {
  const db = readDb();
  const app = db.applications.find((a) => a.id === req.params.id);
  if (!app) return res.status(404).json({ error: 'Application not found.' });

  const filePath = path.join(UPLOAD_DIR, app.resumeStoredName);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Resume file is missing on the server.' });
  }
  res.download(filePath, app.resumeOriginalName);
});

module.exports = router;
