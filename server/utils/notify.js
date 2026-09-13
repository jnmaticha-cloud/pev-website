const { readDb, writeDb } = require('../data/store');
const { sendMail } = require('./mailer');

/**
 * notifyUser — the single place that fires both channels of a user-facing
 * notification: an in-app record (shown via the bell icon while logged in)
 * and an email. Either channel can be skipped (no userId -> no in-app
 * record, e.g. a job applicant with no account; no email -> email skipped).
 *
 * Never throws — a notification failure should never break the admin
 * action that triggered it.
 */
async function notifyUser({ userId, email, subject, text, link }) {
  if (userId) {
    try {
      const db = readDb();
      db.notifications.push({
        id: `notif-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
        userId,
        title: subject,
        body: text,
        link: link || null,
        read: false,
        createdAt: new Date().toISOString(),
      });
      // Keep each user's notification list from growing unbounded.
      const forUser = db.notifications.filter((n) => n.userId === userId);
      if (forUser.length > 100) {
        const toRemoveId = forUser[0].id;
        db.notifications = db.notifications.filter((n) => n.id !== toRemoveId);
      }
      writeDb(db);
    } catch (err) {
      console.error('[notify] Failed to write in-app notification:', err.message);
    }
  }

  if (email) {
    try {
      await sendMail({ to: email, subject, text });
    } catch (err) {
      console.error('[notify] Failed to send email:', err.message);
    }
  }
}

module.exports = { notifyUser };
