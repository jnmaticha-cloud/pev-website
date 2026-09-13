const express = require('express');
const { readDb, writeDb } = require('../data/store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);

// Own notifications only, newest first, plus an unread count so the bell
// icon can show a badge without the caller having to count client-side.
router.get('/', (req, res) => {
  const db = readDb();
  const mine = db.notifications
    .filter((n) => n.userId === req.user.sub)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ notifications: mine, unreadCount: mine.filter((n) => !n.read).length });
});

router.patch('/:id/read', (req, res) => {
  const db = readDb();
  const note = db.notifications.find((n) => n.id === req.params.id && n.userId === req.user.sub);
  if (!note) return res.status(404).json({ error: 'Notification not found.' });
  note.read = true;
  writeDb(db);
  res.json(note);
});

router.post('/mark-all-read', (req, res) => {
  const db = readDb();
  let count = 0;
  db.notifications.forEach((n) => {
    if (n.userId === req.user.sub && !n.read) {
      n.read = true;
      count += 1;
    }
  });
  writeDb(db);
  res.json({ marked: count });
});

module.exports = router;
