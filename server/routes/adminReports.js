const express = require('express');
const { readDb } = require('../data/store');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireRole('admin'), requirePermission('reports'));

const REPORT_TYPES = ['requests', 'applications', 'partners', 'bookings', 'invoices', 'email_requests'];

function inRange(dateStr, from, to) {
  const t = new Date(dateStr).getTime();
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime()) return false;
  return true;
}

function countBy(items, key) {
  const counts = {};
  items.forEach((item) => {
    const k = item[key] || 'unknown';
    counts[k] = (counts[k] || 0) + 1;
  });
  return counts;
}

/**
 * "Generating" a report means: pull the relevant collection, filter it to
 * the requested date range, and return both the filtered rows and a set of
 * aggregate breakdowns — this is computed fresh on every call, not a
 * cached/static file, so it always reflects the current data.
 */
function buildReport(db, type, from, to) {
  switch (type) {
    case 'requests': {
      const rows = db.serviceRequests.filter((r) => inRange(r.createdAt, from, to));
      return {
        type, from: from || null, to: to || null, rowCount: rows.length,
        breakdown: { byStatus: countBy(rows, 'status'), byType: countBy(rows, 'type') },
        rows,
      };
    }
    case 'applications': {
      const rows = db.applications.filter((a) => inRange(a.createdAt, from, to));
      const avgScore = rows.length
        ? Math.round(rows.reduce((sum, a) => sum + (a.adminScore ?? a.autoScore), 0) / rows.length)
        : 0;
      return {
        type, from: from || null, to: to || null, rowCount: rows.length,
        breakdown: { byStatus: countBy(rows, 'status'), byJob: countBy(rows, 'jobTitle'), averageScore: avgScore },
        rows: rows.map(({ resumeStoredName, ...r }) => r),
      };
    }
    case 'partners': {
      const rows = db.partnerApplications.filter((p) => inRange(p.createdAt, from, to));
      return {
        type, from: from || null, to: to || null, rowCount: rows.length,
        breakdown: { byStatus: countBy(rows, 'status'), byType: countBy(rows, 'partnershipType') },
        rows,
      };
    }
    case 'bookings': {
      const rows = db.bookings.filter((b) => inRange(b.createdAt, from, to));
      return {
        type, from: from || null, to: to || null, rowCount: rows.length,
        breakdown: { byStatus: countBy(rows, 'status') },
        rows,
      };
    }
    case 'invoices': {
      const rows = db.invoices.filter((inv) => inRange(inv.issueDate, from, to));
      const totalAmount = rows.reduce((sum, inv) => sum + inv.amount, 0);
      const paidAmount = rows.filter((inv) => inv.status === 'paid').reduce((sum, inv) => sum + inv.amount, 0);
      const outstandingAmount = totalAmount - paidAmount;
      return {
        type, from: from || null, to: to || null, rowCount: rows.length,
        breakdown: { byStatus: countBy(rows, 'status'), totalAmount, paidAmount, outstandingAmount },
        rows,
      };
    }
    case 'email_requests': {
      const rows = db.emailRequests.filter((r) => inRange(r.createdAt, from, to));
      return {
        type, from: from || null, to: to || null, rowCount: rows.length,
        breakdown: { byStatus: countBy(rows, 'status') },
        rows,
      };
    }
    default:
      return null;
  }
}

router.get('/types', (req, res) => {
  res.json(REPORT_TYPES);
});

router.get('/', (req, res) => {
  const { type, from, to } = req.query;
  if (!REPORT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${REPORT_TYPES.join(', ')}` });
  }
  const db = readDb();
  const report = buildReport(db, type, from, to);
  res.json({ ...report, generatedAt: new Date().toISOString() });
});

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escapeCell = (v) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(',')];
  rows.forEach((row) => lines.push(headers.map((h) => escapeCell(row[h])).join(',')));
  return lines.join('\n');
}

router.get('/export', (req, res) => {
  const { type, from, to } = req.query;
  if (!REPORT_TYPES.includes(type)) {
    return res.status(400).json({ error: `type must be one of: ${REPORT_TYPES.join(', ')}` });
  }
  const db = readDb();
  const report = buildReport(db, type, from, to);
  const csv = toCsv(report.rows);

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report.csv"`);
  res.send(csv);
});

module.exports = router;
