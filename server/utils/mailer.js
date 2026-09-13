const nodemailer = require('nodemailer');

/**
 * mailer.js — sends transactional emails for admin decisions (service
 * request status changes, job application status changes, official email
 * request approvals/denials).
 *
 * If SMTP_HOST is set, emails are sent for real via that SMTP server.
 * If it isn't set (e.g. local dev, or this hasn't been configured yet in
 * production), emails are NOT silently dropped — they're logged to the
 * console and kept in an in-memory log so the admin can still see exactly
 * what would have been sent, via GET /api/admin/notifications. This means
 * the notification *logic* (who gets emailed, when, with what content) is
 * fully exercised and testable even without a real mail server.
 */

const MAX_LOG_ENTRIES = 200;
const sentLog = [];

let cachedTransporter;
let cachedTransporterKey;

function transporterConfigKey() {
  return [
    process.env.SMTP_HOST,
    process.env.SMTP_PORT,
    process.env.SMTP_USER,
    process.env.SMTP_SECURE,
  ].join('|');
}

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  const key = transporterConfigKey();
  if (cachedTransporter && cachedTransporterKey === key) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
  cachedTransporterKey = key;
  return cachedTransporter;
}

function record(entry) {
  sentLog.push(entry);
  if (sentLog.length > MAX_LOG_ENTRIES) sentLog.shift();
}

/**
 * Send a transactional email. Never throws — a mail failure should not
 * break the admin action that triggered it (e.g. a status update should
 * still succeed even if the mail server is briefly down).
 */
async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || 'Prime Elite Ventures <no-reply@primeeliteventures.example>';
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`\n[mailer] SMTP not configured — logging instead of sending:\nTo: ${to}\nSubject: ${subject}\n${text}\n`);
    const entry = { to, subject, text, sentAt: new Date().toISOString(), delivered: false, simulated: true };
    record(entry);
    return entry;
  }

  try {
    await transporter.sendMail({ from, to, subject, text, html });
    const entry = { to, subject, text, sentAt: new Date().toISOString(), delivered: true, simulated: false };
    record(entry);
    return entry;
  } catch (err) {
    console.error('[mailer] Failed to send email:', err.message);
    const entry = { to, subject, text, sentAt: new Date().toISOString(), delivered: false, simulated: false, error: err.message };
    record(entry);
    return entry;
  }
}

function getSentLog() {
  return sentLog.slice().reverse(); // newest first
}

module.exports = { sendMail, getSentLog };
