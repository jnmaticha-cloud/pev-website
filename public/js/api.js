/**
 * api.js — thin wrapper around the Prime Elite Ventures backend.
 * Exposes window.PEVApi for use by other scripts.
 */
(function () {
  const TOKEN_KEY = 'pev-token';
  const USER_KEY = 'pev-user';

  function getToken() {
    try { return window.localStorage.getItem(TOKEN_KEY); } catch (e) { return null; }
  }
  function setSession(token, user) {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
      window.localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) { /* ignore */ }
  }
  function clearSession() {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(USER_KEY);
    } catch (e) { /* ignore */ }
  }
  function getUser() {
    try {
      const raw = window.localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  async function request(path, options) {
    const opts = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });

    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed');
      err.status = res.status;
      err.fields = data && data.fields;
      throw err;
    }
    return data;
  }

  // Multipart (file upload) variant — no Content-Type header, browser sets the boundary.
  async function requestForm(path, formData, method) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;

    const res = await fetch('/api' + path, { method: method || 'POST', headers, body: formData });

    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }

    if (!res.ok) {
      const err = new Error((data && data.error) || 'Request failed');
      err.status = res.status;
      err.fields = data && data.fields;
      throw err;
    }
    return data;
  }

  // Downloads an admin-only file (resume) as a blob and triggers a save, since
  // the endpoint requires an Authorization header a plain <a href> can't send.
  async function downloadAuthed(path, suggestedName) {
    const token = getToken();
    const res = await fetch('/api' + path, { headers: token ? { Authorization: 'Bearer ' + token } : {} });
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch (e) { /* ignore */ }
      throw new Error((data && data.error) || 'Download failed');
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestedName || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
  }

  window.PEVApi = {
    getServices: () => request('/services'),
    getService: (slug) => request('/services/' + encodeURIComponent(slug)),
    getTeam: () => request('/team'),
    getDirectors: () => request('/directors'),
    getGallery: (category) => request('/gallery' + (category && category !== 'All' ? '?category=' + encodeURIComponent(category) : '')),
    getCareers: () => request('/careers'),
    getStats: () => request('/stats'),
    getSettings: () => request('/settings'),
    getSiteCopy: () => request('/site-copy'),
    getCoreValues: () => request('/core-values'),
    getResources: () => request('/resources'),
    getProjects: () => request('/projects'),
    sendContact: (payload) => request('/contact', { method: 'POST', body: payload }),
    register: (payload) => request('/auth/register', { method: 'POST', body: payload }).then((d) => { if (d.token) setSession(d.token, d.user); return d; }),
    login: (payload) => request('/auth/login', { method: 'POST', body: payload }).then((d) => { setSession(d.token, d.user); return d; }),
    me: () => request('/auth/me'),

    // Client / company portal — own service & project requests
    getMyRequests: (type) => request('/requests' + (type ? '?type=' + encodeURIComponent(type) : '')),
    submitRequest: (payload) => request('/requests', { method: 'POST', body: payload }),

    // Any authenticated account — official email request workflow
    getMyEmailRequests: () => request('/email-requests'),
    submitEmailRequest: (payload) => request('/email-requests', { method: 'POST', body: payload }),

    // Public — job applications (multipart, includes resume file)
    applyForJob: (jobId, formData) => requestForm('/careers/' + encodeURIComponent(jobId) + '/apply', formData),

    // Public — partner applications
    applyAsPartner: (payload) => request('/partners/apply', { method: 'POST', body: payload }),

    // Any authenticated account — in-app notifications
    getNotifications: () => request('/notifications'),
    markNotificationRead: (id) => request('/notifications/' + encodeURIComponent(id) + '/read', { method: 'PATCH' }),
    markAllNotificationsRead: () => request('/notifications/mark-all-read', { method: 'POST' }),

    // Admin portal — everything, admin-role + permission gated on the backend
    adminSummary: () => request('/admin/summary'),
    adminGetCompanyAccounts: () => request('/admin/company-accounts'),
    adminDecideCompanyAccount: (id, status) => request('/admin/company-accounts/' + encodeURIComponent(id), { method: 'PATCH', body: { status } }),
    adminMessages: () => request('/admin/messages'),
    adminUsers: () => request('/admin/users'),
    adminGetStaff: () => request('/admin/staff'),
    adminGetStaffCategories: () => request('/admin/staff/categories'),
    adminGetPermissions: () => request('/admin/permissions'),
    adminCreateStaff: (payload) => request('/admin/staff', { method: 'POST', body: payload }),
    adminUpdateStaff: (id, payload) => request('/admin/staff/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),
    adminDeleteStaff: (id) => request('/admin/staff/' + encodeURIComponent(id), { method: 'DELETE' }),
    adminRequests: (type) => request('/admin/requests' + (type ? '?type=' + encodeURIComponent(type) : '')),
    adminUpdateRequestStatus: (id, status) => request('/admin/requests/' + encodeURIComponent(id), { method: 'PATCH', body: { status } }),

    // Admin — official email requests
    adminGetEmailRequests: () => request('/admin/email-requests'),
    adminUpdateEmailRequest: (id, payload) => request('/admin/email-requests/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),
    adminGetNotifications: () => request('/admin/notifications'),

    // Client / company portal — own bookings and invoices
    getMyBookings: () => request('/bookings'),
    submitBooking: (payload) => request('/bookings', { method: 'POST', body: payload }),
    getMyInvoices: () => request('/invoices'),

    // Admin — partner applications
    adminGetPartners: () => request('/admin/partners'),
    adminUpdatePartner: (id, payload) => request('/admin/partners/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),

    // Admin — bookings
    adminGetBookings: () => request('/admin/bookings'),
    adminUpdateBooking: (id, payload) => request('/admin/bookings/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),

    // Admin — invoices
    adminGetInvoices: () => request('/admin/invoices'),
    adminCreateInvoice: (payload) => request('/admin/invoices', { method: 'POST', body: payload }),
    adminUpdateInvoice: (id, payload) => request('/admin/invoices/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),

    // Admin — reports (generate + export)
    adminGetReportTypes: () => request('/admin/reports/types'),
    adminGenerateReport: (type, from, to) => request('/admin/reports?' + new URLSearchParams({ type, ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()),
    adminExportReport: (type, from, to) => downloadAuthed('/admin/reports/export?' + new URLSearchParams({ type, ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString(), `${type}-report.csv`),

    // Admin — image/file uploads (returns { url })
    adminUploadImage: (formData) => requestForm('/admin/upload-image', formData),
    adminUploadFile: (formData) => requestForm('/admin/upload-file', formData),

    // Admin — site content CRUD
    adminGetContent: (collection) => request('/admin/content/' + collection),
    adminCreateContent: (collection, payload) => request('/admin/content/' + collection, { method: 'POST', body: payload }),
    adminUpdateContent: (collection, id, payload) => request('/admin/content/' + collection + '/' + encodeURIComponent(id), { method: 'PUT', body: payload }),
    adminDeleteContent: (collection, id) => request('/admin/content/' + collection + '/' + encodeURIComponent(id), { method: 'DELETE' }),
    adminGetSettings: () => request('/admin/settings'),
    adminUpdateSettings: (payload) => request('/admin/settings', { method: 'PUT', body: payload }),
    adminGetSingleton: (name) => request('/admin/singleton/' + encodeURIComponent(name)),
    adminUpdateSingleton: (name, payload) => request('/admin/singleton/' + encodeURIComponent(name), { method: 'PUT', body: payload }),

    // Admin — job applications (ranking, override, resume download)
    adminGetApplications: (jobId) => request('/admin/applications' + (jobId ? '?jobId=' + encodeURIComponent(jobId) : '')),
    adminApplicationsSummary: () => request('/admin/applications/summary'),
    adminUpdateApplication: (id, payload) => request('/admin/applications/' + encodeURIComponent(id), { method: 'PATCH', body: payload }),
    adminDownloadResume: (id, filename) => downloadAuthed('/admin/applications/' + encodeURIComponent(id) + '/resume', filename),

    logout: clearSession,
    getUser,
    isAuthed: () => !!getToken(),
    hasPermission: (perm) => {
      const u = getUser();
      return !!(u && Array.isArray(u.permissions) && u.permissions.includes(perm));
    },
    portalPathForRole: (role) => (role === 'admin' ? '/admin' : role === 'company' ? '/portal-company' : '/portal-client'),
  };
})();
