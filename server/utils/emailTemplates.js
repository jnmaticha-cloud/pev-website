/**
 * emailTemplates.js — plain-language subject/body text for each
 * notification the system sends when an admin makes a decision.
 */

const REQUEST_STATUS_TEXT = {
  pending: 'received and is pending review',
  in_progress: 'now in progress',
  completed: 'marked as completed',
  cancelled: 'cancelled',
};

function serviceRequestStatusEmail({ name, service, status }) {
  const phrase = REQUEST_STATUS_TEXT[status] || `updated to "${status}"`;
  return {
    subject: `Update on your service request: ${service}`,
    text:
      `Hi ${name},\n\n` +
      `Your request for "${service}" has been ${phrase}.\n\n` +
      `You can view the latest status any time by logging into your portal.\n\n` +
      `— Prime Elite Ventures`,
  };
}

const APPLICATION_STATUS_TEXT = {
  new: 'received',
  reviewed: 'reviewed by our team',
  shortlisted: 'shortlisted for further consideration',
  rejected: 'not selected to move forward at this time',
  hired: 'selected — congratulations!',
};

function applicationStatusEmail({ name, jobTitle, status }) {
  const phrase = APPLICATION_STATUS_TEXT[status] || `updated to "${status}"`;
  return {
    subject: `Update on your application: ${jobTitle}`,
    text:
      `Hi ${name},\n\n` +
      `Thank you for applying for ${jobTitle} at Prime Elite Ventures. ` +
      `Your application has been ${phrase}.\n\n` +
      (status === 'rejected'
        ? `We appreciate the time you put into your application and encourage you to apply for future openings.\n\n`
        : status === 'hired'
        ? `Our team will be in touch shortly with next steps.\n\n`
        : '') +
      `— Prime Elite Ventures Talent Team`,
  };
}

const MAIL_REQUEST_STATUS_TEXT = {
  pending: 'received and is pending review',
  approved: 'approved',
  denied: 'denied',
};

function emailRequestStatusEmail({ name, status, adminNote, requestedAddress }) {
  const phrase = MAIL_REQUEST_STATUS_TEXT[status] || `updated to "${status}"`;
  return {
    subject: `Your official email request has been ${status === 'approved' ? 'approved' : status === 'denied' ? 'denied' : 'updated'}`,
    text:
      `Hi ${name},\n\n` +
      `Your request for an official Prime Elite Ventures mailbox${requestedAddress ? ` (${requestedAddress})` : ''} has been ${phrase}.\n` +
      (adminNote ? `\nNote from our team: ${adminNote}\n` : '') +
      `\n— Prime Elite Ventures`,
  };
}

module.exports = { serviceRequestStatusEmail, applicationStatusEmail, emailRequestStatusEmail };
