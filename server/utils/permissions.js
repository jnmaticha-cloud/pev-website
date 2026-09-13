/**
 * permissions.js — the granular rights system for staff accounts.
 *
 * Every staff (role: 'admin') account has a `category` (their job title
 * type — CEO, HR, Accountant, etc.) and a `permissions` array (what they
 * can actually access in the system). A category has a sensible DEFAULT
 * permission set, applied automatically when a staff account is created,
 * but an individual account's permissions can be customized beyond that
 * default — the category drives the starting point, not a hard ceiling.
 *
 * This is deliberately separate from `role` ('admin' vs 'client' vs
 * 'company'), which only distinguishes portal types. `role: 'admin'` means
 * "this is a staff login"; `permissions` governs which parts of the admin
 * portal that particular staff member can actually reach.
 */

const ALL_PERMISSIONS = [
  'requests',       // service & project requests: view, update status
  'applications',   // job applications: view, rank, update status
  'content',        // site CMS: services, projects, gallery, directors, careers, resources, core values, hero/about copy, stats, settings
  'staff',          // create/edit/remove staff accounts
  'users',          // view registered clients & companies
  'messages',       // contact form messages
  'email_requests', // approve/deny official email requests
  'reports',        // view & generate reports, view notification log
  'partners',       // review partner applications
  'invoices',       // create/manage client & company invoices
  'bookings',       // manage consultation bookings
];

const STAFF_CATEGORIES = ['CEO', 'COO', 'CFO', 'Accountant', 'Director', 'HR', 'Staff'];

// What each category gets by default when an account is created. Admins
// can grant/revoke individual permissions beyond this when creating or
// editing a staff account — this is a starting point, not a hard rule.
const CATEGORY_DEFAULT_PERMISSIONS = {
  CEO: [...ALL_PERMISSIONS],
  COO: [...ALL_PERMISSIONS],
  CFO: ['reports', 'invoices', 'bookings', 'requests'],
  Accountant: ['reports', 'invoices', 'bookings'],
  Director: ['requests', 'applications', 'content', 'reports', 'partners'],
  HR: ['staff', 'applications', 'users', 'reports'],
  Staff: ['requests'],
};

function defaultPermissionsForCategory(category) {
  return CATEGORY_DEFAULT_PERMISSIONS[category] ? [...CATEGORY_DEFAULT_PERMISSIONS[category]] : ['requests'];
}

function sanitizePermissions(input) {
  if (!Array.isArray(input)) return null;
  const clean = input.filter((p) => ALL_PERMISSIONS.includes(p));
  return [...new Set(clean)];
}

module.exports = {
  ALL_PERMISSIONS,
  STAFF_CATEGORIES,
  CATEGORY_DEFAULT_PERMISSIONS,
  defaultPermissionsForCategory,
  sanitizePermissions,
};
