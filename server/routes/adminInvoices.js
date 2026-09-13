const express = require('express');
const { readDb, writeDb } = require('../data/store');
const { requireAuth, requireRole, requirePermission } = require('../middleware/auth');
const { notifyUser } = require('../utils/notify');

const router = express.Router();

const VALID_STATUSES = ['unpaid', 'paid', 'overdue', 'cancelled'];

router.use(requireAuth, requireRole('admin'), requirePermission('invoices'));

router.get('/', (req, res) => {
  const db = readDb();
  const all = db.invoices.slice().sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));
  res.json(all);
});

router.post('/', (req, res) => {
  const { userId, description, amount, currency, dueDate } = req.body || {};
  const errors = {};

  const db = readDb();
  const client = db.users.find((u) => u.id === userId && (u.role === 'client' || u.role === 'company'));
  if (!client) errors.userId = 'Please select a valid client or company.';
  if (!description || !description.trim()) errors.description = 'Description is required.';
  if (amount === undefined || amount === null || isNaN(Number(amount)) || Number(amount) <= 0) {
    errors.amount = 'Amount must be a positive number.';
  }
  if (!dueDate) errors.dueDate = 'Due date is required.';

  if (Object.keys(errors).length) {
    return res.status(400).json({ error: 'Validation failed.', fields: errors });
  }

  const invoiceNumber = `INV-${new Date().getFullYear()}-${String(db.invoices.length + 1).padStart(4, '0')}`;
  const entry = {
    id: `inv-${Date.now()}`,
    invoiceNumber,
    userId: client.id,
    userName: client.name,
    description: description.trim(),
    amount: Number(amount),
    currency: currency || 'USD',
    status: 'unpaid',
    issueDate: new Date().toISOString(),
    dueDate,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.invoices.push(entry);
  writeDb(db);

  res.status(201).json(entry);

  const subject = `New invoice ${invoiceNumber}: ${entry.currency} ${entry.amount}`;
  const text =
    `Hi ${client.name},\n\n` +
    `A new invoice has been issued: ${invoiceNumber} for ${entry.currency} ${entry.amount} — ${entry.description}.\n` +
    `Due date: ${new Date(dueDate).toLocaleDateString()}.\n\n` +
    `You can view it any time from your portal.\n\n— Prime Elite Ventures`;
  notifyUser({ userId: client.id, email: client.email, subject, text }).catch(() => {});
});

router.patch('/:id', (req, res) => {
  const { status } = req.body || {};
  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const db = readDb();
  const invoice = db.invoices.find((inv) => inv.id === req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });

  const statusChanged = status !== undefined && invoice.status !== status;
  if (status !== undefined) invoice.status = status;
  invoice.updatedAt = new Date().toISOString();
  writeDb(db);

  res.json(invoice);

  if (statusChanged && invoice.status === 'paid') {
    const owner = db.users.find((u) => u.id === invoice.userId);
    if (owner) {
      const subject = `Invoice ${invoice.invoiceNumber} marked as paid`;
      const text = `Hi ${owner.name},\n\nThank you — invoice ${invoice.invoiceNumber} has been marked as paid.\n\n— Prime Elite Ventures`;
      notifyUser({ userId: owner.id, email: owner.email, subject, text }).catch(() => {});
    }
  }
});

module.exports = router;
