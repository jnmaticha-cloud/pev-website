const path = require('path');
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const contentRoutes = require('./routes/content');
const contactRoutes = require('./routes/contact');
const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const adminContentRoutes = require('./routes/adminContent');
const adminApplicationsRoutes = require('./routes/adminApplications');
const adminUploadRoutes = require('./routes/adminUpload');
const applicationsRoutes = require('./routes/applications');
const { router: requestsRoutes } = require('./routes/requests');
const { router: emailRequestsRoutes } = require('./routes/emailRequests');
const { router: partnersRoutes } = require('./routes/partners');
const adminPartnersRoutes = require('./routes/adminPartners');
const notificationsRoutes = require('./routes/notifications');
const { router: bookingsRoutes } = require('./routes/bookings');
const adminBookingsRoutes = require('./routes/adminBookings');
const invoicesRoutes = require('./routes/invoices');
const adminInvoicesRoutes = require('./routes/adminInvoices');
const adminReportsRoutes = require('./routes/adminReports');
const adminCompanyAccountsRoutes = require('./routes/adminCompanyAccounts');
const newsRoutes = require('./routes/news');
const { DEV_JWT_SECRET } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// Refuse to boot in production with the default JWT secret — a leaked or
// guessed default secret lets anyone forge a valid session for any role,
// including admin. This check only blocks startup; it doesn't affect dev.
if (IS_PRODUCTION && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEV_JWT_SECRET)) {
  console.error(
    '\nFATAL: NODE_ENV=production but JWT_SECRET is unset or still the development default.\n' +
    'Set a long, random JWT_SECRET environment variable before starting in production.\n' +
    "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"\n"
  );
  process.exit(1);
}

// CORS: this app serves its own frontend from the same origin as its API,
// so same-origin browser requests never need CORS at all — this setting
// only affects OTHER websites calling this API from a user's browser.
//   - ALLOWED_ORIGINS env var (comma-separated) restricts to exactly those origins.
//   - Otherwise: wide open in development (matches prior behavior), and
//     closed to cross-origin callers by default in production, since an
//     explicit allowlist wasn't provided.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const corsOptions = allowedOrigins.length
  ? { origin: allowedOrigins }
  : { origin: IS_PRODUCTION ? false : true };

app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true }));

// Basic rate limiting on write-ish endpoints to avoid abuse
const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/contact', writeLimiter);
app.use('/api/auth', writeLimiter);
app.use('/api/careers', writeLimiter);
app.use('/api/partners', writeLimiter);

// API routes
app.use('/api', contentRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminContentRoutes);
app.use('/api/admin/applications', adminApplicationsRoutes);
app.use('/api/admin', adminUploadRoutes);
app.use('/api/admin/partners', adminPartnersRoutes);
app.use('/api/admin/bookings', adminBookingsRoutes);
app.use('/api/admin/invoices', adminInvoicesRoutes);
app.use('/api/admin/reports', adminReportsRoutes);
app.use('/api/admin/company-accounts', adminCompanyAccountsRoutes);
app.use('/api', newsRoutes);
app.use('/api/careers', applicationsRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/email-requests', emailRequestsRoutes);
app.use('/api/partners', partnersRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/notifications', notificationsRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Static frontend (extension-less routes like /login resolve to login.html)
// Individual service pages: /services/finance, /services/strategy, etc.
// One shared template (service.html) reads the slug from the URL client-side
// and fetches the matching record from /api/services/:slug.
app.get('/services/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'service.html'));
});

app.use(express.static(path.join(__dirname, '..', 'public'), { extensions: ['html'] }));

// Fallback to index.html for any non-API GET (simple SPA-style routing for /login, /dashboard etc.)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Central error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our end.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Prime Elite Ventures server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
