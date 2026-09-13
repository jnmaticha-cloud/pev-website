const jwt = require('jsonwebtoken');
const { readDb } = require('../data/store');

const crypto = require('crypto');
const DEV_JWT_SECRET = 'dev-secret-change-in-production';
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === DEV_JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.warn('[WARN] JWT_SECRET unset in production. Using an auto-generated random secret for this instance.');
    JWT_SECRET = crypto.randomBytes(32).toString('hex');
  } else {
    JWT_SECRET = DEV_JWT_SECRET;
  }
}

function signToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session.' });
  }

  // JWTs are stateless and can't be revoked on their own, so a token stays
  // cryptographically valid until it expires even after the account behind
  // it is deleted. Re-check the user still exists on every request so a
  // removed account (e.g. an off-boarded staff member) loses access
  // immediately, not up to 7 days later. Also refresh role/name/email from
  // the live record rather than trusting the (potentially stale) token
  // claims, in case those ever change after the token was issued.
  const db = readDb();
  const user = db.users.find((u) => u.id === payload.sub);
  if (!user) {
    return res.status(401).json({ error: 'This account no longer exists.' });
  }

  req.user = { sub: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions || [] };
  next();
}

/**
 * requireRole('admin') or requireRole('client', 'company') — call AFTER requireAuth.
 * Rejects with 403 if the authenticated user's role isn't in the allowed list.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'You do not have access to this resource.' });
    }
    next();
  };
}

/**
 * requirePermission('reports') or requirePermission('content', 'staff') —
 * call AFTER requireRole('admin'). Passes if the staff account has ANY of
 * the listed permissions (an "or" match, since e.g. a report might be
 * reachable via either the 'reports' or 'requests' permission). A CEO/COO
 * account has every permission by default, so this never blocks the top
 * of the org chart; an Accountant or HR account only reaches what their
 * category grants (customizable per-account — see utils/permissions.js).
 */
function requirePermission(...allowedPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You do not have access to this resource.' });
    }
    const has = allowedPermissions.some((p) => req.user.permissions.includes(p));
    if (!has) {
      return res.status(403).json({ error: 'Your account does not have permission to access this resource.' });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, requireRole, requirePermission, JWT_SECRET, DEV_JWT_SECRET };
