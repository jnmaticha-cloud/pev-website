const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

// Public-facing uploads live under /public so express.static serves them
// directly (unlike resumes, which are private and served through an
// authenticated download route instead).
const IMAGE_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'images');
const FILE_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'files');
fs.mkdirSync(IMAGE_DIR, { recursive: true });
fs.mkdirSync(FILE_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ALLOWED_FILE_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

function makeStorage(dir) {
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dir),
    filename: (req, file, cb) => {
      const safeExt = path.extname(file.originalname).slice(0, 10).replace(/[^a-zA-Z0-9.]/g, '');
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e6)}${safeExt}`);
    },
  });
}

const uploadImage = multer({
  storage: makeStorage(IMAGE_DIR),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB — modern phone camera photos are often 3-8MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WebP, or GIF images are allowed.'));
    }
    cb(null, true);
  },
});

const uploadFile = multer({
  storage: makeStorage(FILE_DIR),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB, resource downloads (PDF/Word/images)
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_FILE_MIME.has(file.mimetype)) {
      return cb(new Error('Only images, PDF, or Word documents are allowed.'));
    }
    cb(null, true);
  },
});

function friendlyUploadError(err, limitMb) {
  if (err.code === 'LIMIT_FILE_SIZE') {
    return `That file is larger than the ${limitMb}MB limit. Please choose a smaller file.`;
  }
  return err.message || 'Upload failed.';
}

router.use(requireAuth, requireRole('admin'));

router.post('/upload-image', requirePermission('content', 'staff'), (req, res) => {
  uploadImage.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: friendlyUploadError(err, 8) });
    if (!req.file) return res.status(400).json({ error: 'No image file received.' });
    res.status(201).json({ url: `/uploads/images/${req.file.filename}` });
  });
});

router.post('/upload-file', requirePermission('content', 'staff'), (req, res) => {
  uploadFile.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: friendlyUploadError(err, 15) });
    if (!req.file) return res.status(400).json({ error: 'No file received.' });
    res.status(201).json({ url: `/uploads/files/${req.file.filename}`, originalName: req.file.originalname });
  });
});

module.exports = router;
