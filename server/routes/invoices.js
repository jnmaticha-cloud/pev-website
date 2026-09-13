const express = require('express');
const { readDb } = require('../data/store');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Invoices are created and managed entirely by admin (Accountant/CFO/CEO) —
// clients and companies can only view their own, never create or edit one.
router.use(requireAuth, requireRole('client', 'company'));

router.get('/', (req, res) => {
  const db = readDb();
  const mine = db.invoices
    .filter((inv) => inv.userId === req.user.sub)
    .sort((a, b) => new Date(b.issueDate) - new Date(a.issueDate));
  res.json(mine);
});

module.exports = router;
