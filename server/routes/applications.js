const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { readDb, writeDb } = require('../data/store');
const { computeAutoScore, EDUCATION_LEVELS } = require('../utils/scoring');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'resumes');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safeExt = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
    cb(null, `resume-${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Resume must be a PDF or Word document.'));
    }
    cb(null, true);
  },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/:jobId/apply', (req, res) => {
  upload.single('resume')(req, res, (uploadErr) => {
    if (uploadErr) {
      return res.status(400).json({ error: uploadErr.message || 'Resume upload failed.' });
    }

    const db = readDb();
    const job = db.careers.find((c) => c.id === req.params.jobId);
    if (!job) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'This job posting no longer exists.' });
    }

    const { name, email, phone, yearsExperience, education, coverMessage } = req.body || {};
    const errors = {};
    if (!name || !name.trim()) errors.name = 'Name is required.';
    if (!email || !EMAIL_RE.test(email)) errors.email = 'A valid email is required.';
    if (!coverMessage || !coverMessage.trim()) errors.coverMessage = 'Please add a short cover message.';
    if (yearsExperience === undefined || yearsExperience === '' || isNaN(Number(yearsExperience)) || Number(yearsExperience) < 0) {
      errors.yearsExperience = 'Years of experience must be a non-negative number.';
    }
    if (!education || !EDUCATION_LEVELS.includes(education)) {
      errors.education = `Education must be one of: ${EDUCATION_LEVELS.join(', ')}.`;
    }
    if (!req.file) {
      errors.resume = 'A resume (PDF or Word) is required.';
    }

    if (Object.keys(errors).length) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Validation failed.', fields: errors });
    }

    const autoScore = computeAutoScore(
      { education, yearsExperience, coverMessage },
      job.keywords || []
    );

    const entry = {
      id: `app-${Date.now()}`,
      jobId: job.id,
      jobTitle: job.title,
      name: name.trim(),
      email: email.trim(),
      phone: phone ? phone.trim() : null,
      yearsExperience: Number(yearsExperience),
      education,
      coverMessage: coverMessage.trim(),
      resumeStoredName: req.file.filename,
      resumeOriginalName: req.file.originalname,
      autoScore,
      adminScore: null,
      status: 'new',
      createdAt: new Date().toISOString(),
    };

    db.applications.push(entry);
    writeDb(db);

    const { resumeStoredName, ...publicEntry } = entry;
    res.status(201).json({ message: 'Application received. We will be in touch if there is a match.', application: publicEntry });
  });
});

module.exports = router;
