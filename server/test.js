/**
 * Lightweight integration test suite — no external test framework needed.
 * Boots the Express app in-process and exercises the API surface end to end,
 * including the three-portal role system (client / company / admin).
 * Run with: npm test
 */
const http = require('http');
const app = require('./index');

const PORT = 4321;
let server;
let passed = 0;
let failed = 0;

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);

    const req = http.request(
      { hostname: 'localhost', port: PORT, path, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          let json = null;
          try { json = JSON.parse(raw); } catch (e) { /* non-JSON response, e.g. HTML */ }
          resolve({ status: res.statusCode, body: json, raw });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Minimal multipart/form-data builder — enough to exercise the resume upload
// endpoint without pulling in an extra dependency just for tests.
function requestMultipart(method, path, fields, fileField, fileBuffer, fileName, mimeType, token) {
  return new Promise((resolve, reject) => {
    const boundary = '----pevtestboundary' + Date.now();
    const parts = [];
    Object.entries(fields).forEach(([key, value]) => {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`
      );
    });
    if (fileField) {
      parts.push(
        `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`
      );
    }
    const head = Buffer.from(parts.join(''), 'utf-8');
    const tail = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8');
    const body = fileField ? Buffer.concat([head, fileBuffer, tail]) : Buffer.concat([head, Buffer.from(`--${boundary}--\r\n`)]);

    const headers = {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length,
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const req = http.request({ hostname: 'localhost', port: PORT, path, method, headers }, (res) => {
      let raw = '';
      res.on('data', (c) => (raw += c));
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { /* ignore */ }
        resolve({ status: res.statusCode, body: json, raw });
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function check(label, condition) {
  if (condition) {
    console.log(`  \u2713 ${label}`);
    passed += 1;
  } else {
    console.log(`  \u2717 ${label}`);
    failed += 1;
  }
}

async function run() {
  console.log('Starting server for tests on port', PORT, '...');
  await new Promise((resolve) => {
    server = app.listen(PORT, resolve);
  });

  try {
    console.log('\nHealth & content endpoints');
    let r = await request('GET', '/api/health');
    check('GET /api/health -> 200', r.status === 200);

    r = await request('GET', '/api/services');
    check('GET /api/services -> array of 6', r.status === 200 && Array.isArray(r.body) && r.body.length === 6);

    r = await request('GET', '/api/team');
    check('GET /api/team -> non-empty array', r.status === 200 && r.body.length > 0);

    r = await request('GET', '/api/gallery?category=Team');
    check('GET /api/gallery?category=Team -> filtered', r.status === 200 && r.body.every((g) => g.category === 'Team'));

    r = await request('GET', '/api/stats');
    check('GET /api/stats -> has successRate', r.status === 200 && !!r.body.successRate);

    console.log('\nContact form');
    r = await request('POST', '/api/contact', { name: 'Test User', email: 'test@example.com', message: 'Hello there' });
    check('POST /api/contact valid -> 201', r.status === 201);

    r = await request('POST', '/api/contact', { name: '', email: 'bad', message: '' });
    check('POST /api/contact invalid -> 400 with field errors', r.status === 400 && r.body.fields && r.body.fields.name);

    console.log('\nClient registration & login');
    const clientEmail = `client-${Date.now()}@example.com`;
    r = await request('POST', '/api/auth/register', { name: 'Client User', email: clientEmail, password: 'password123', role: 'client' });
    check('POST /api/auth/register (client) -> 201, role=client', r.status === 201 && r.body.user.role === 'client');
    const clientToken = r.body.token;

    r = await request('POST', '/api/auth/register', { name: 'Client User', email: clientEmail, password: 'password123', role: 'client' });
    check('POST /api/auth/register duplicate -> 409', r.status === 409);

    r = await request('POST', '/api/auth/register', { name: 'Weak', email: `weak-${Date.now()}@example.com`, password: '123', role: 'client' });
    check('POST /api/auth/register weak password -> 400', r.status === 400);

    r = await request('POST', '/api/auth/login', { email: clientEmail, password: 'password123' });
    check('POST /api/auth/login correct -> 200 with token', r.status === 200 && !!r.body.token);

    r = await request('POST', '/api/auth/login', { email: clientEmail, password: 'wrong' });
    check('POST /api/auth/login wrong password -> 401', r.status === 401);

    r = await request('GET', '/api/auth/me', null, clientToken);
    check('GET /api/auth/me with token -> 200', r.status === 200 && r.body.user.email === clientEmail);

    r = await request('GET', '/api/auth/me');
    check('GET /api/auth/me without token -> 401', r.status === 401);

    console.log('\nCompany registration');
    const companyEmail = `company-${Date.now()}@example.com`;
    r = await request('POST', '/api/auth/register', { name: 'Biz Contact', email: companyEmail, password: 'password123', role: 'company', companyName: 'Acme Retail Ltd', contactTitle: 'CFO' });
    check('POST /api/auth/register (company) -> 201, pending approval', r.status === 201 && r.body.pending === true);

    r = await request('POST', '/api/auth/login', { email: companyEmail, password: 'password123' });
    check('POST /api/auth/login (company, still pending) -> 403', r.status === 403);

    r = await request('POST', '/api/auth/register', { name: 'Biz Contact', email: `company2-${Date.now()}@example.com`, password: 'password123', role: 'company' });
    check('POST /api/auth/register company without companyName -> 400', r.status === 400 && r.body.fields && r.body.fields.companyName && r.body.fields.contactTitle);

    console.log('\nAdmin login (seeded account)');
    r = await request('POST', '/api/auth/login', { email: 'admin@primeeliteventures.example', password: 'AdminPass123!' });
    check('POST /api/auth/login (seeded admin) -> 200, role=admin', r.status === 200 && r.body.user.role === 'admin');
    const adminToken = r.body.token;
    const adminUserId = r.body.user.id;

    console.log('\nCompany account approval queue');
    r = await request('GET', '/api/admin/company-accounts', null, adminToken);
    check('GET /api/admin/company-accounts (admin) -> includes the pending signup', r.status === 200 && r.body.some((a) => a.email === companyEmail && a.status === 'pending'));
    const pendingCompany = r.body.find((a) => a.email === companyEmail);

    r = await request('PATCH', `/api/admin/company-accounts/${pendingCompany.id}`, { status: 'active' }, adminToken);
    check('PATCH /api/admin/company-accounts/:id approve -> 200, status=active', r.status === 200 && r.body.status === 'active');

    r = await request('POST', '/api/auth/login', { email: companyEmail, password: 'password123' });
    check('POST /api/auth/login (company, now approved) -> 200, role=company', r.status === 200 && r.body.user.role === 'company' && r.body.user.companyName === 'Acme Retail Ltd');
    const companyToken = r.body.token;

    console.log('\nClient portal — service requests');
    r = await request('GET', '/api/requests', null, clientToken);
    check('GET /api/requests (client) -> 200, array', r.status === 200 && Array.isArray(r.body));

    r = await request('POST', '/api/requests', { service: 'Strategy & Advisory', details: 'Need a market entry plan.' }, clientToken);
    check('POST /api/requests (client) -> 201, status=pending', r.status === 201 && r.body.status === 'pending');
    const clientRequestId = r.body.id;

    r = await request('POST', '/api/requests', { service: '', details: '' }, clientToken);
    check('POST /api/requests invalid -> 400', r.status === 400 && r.body.fields);

    r = await request('POST', '/api/requests', { service: 'Financial Structuring', details: 'Need help raising a Series A.' }, companyToken);
    check('POST /api/requests (company) -> 201', r.status === 201);

    r = await request('POST', '/api/requests', { service: 'x', details: 'y' });
    check('POST /api/requests without token -> 401', r.status === 401);

    console.log('\nRole boundaries — client/company cannot reach admin routes');
    r = await request('GET', '/api/admin/summary', null, clientToken);
    check('GET /api/admin/summary as client -> 403', r.status === 403);

    r = await request('GET', '/api/admin/summary', null, companyToken);
    check('GET /api/admin/summary as company -> 403', r.status === 403);

    console.log('\nRole boundaries — admin cannot submit service requests as a client');
    r = await request('POST', '/api/requests', { service: 'x', details: 'y' }, adminToken);
    check('POST /api/requests as admin -> 403', r.status === 403);

    console.log('\nAdmin portal');
    r = await request('GET', '/api/admin/summary', null, adminToken);
    check('GET /api/admin/summary as admin -> 200', r.status === 200 && typeof r.body.totalRequests === 'number');

    r = await request('GET', '/api/admin/summary');
    check('GET /api/admin/summary without token -> 401', r.status === 401);

    r = await request('GET', '/api/admin/summary', null, 'garbage.invalid.token');
    check('GET /api/admin/summary with bad token -> 401', r.status === 401);

    r = await request('GET', '/api/admin/users', null, adminToken);
    check('GET /api/admin/users as admin -> includes new client & company', r.status === 200 && r.body.some((u) => u.email === clientEmail) && r.body.some((u) => u.email === companyEmail));

    r = await request('GET', '/api/admin/requests', null, adminToken);
    check('GET /api/admin/requests as admin -> sees both new requests', r.status === 200 && r.body.length >= 2);

    r = await request('PATCH', `/api/admin/requests/${clientRequestId}`, { status: 'in_progress' }, adminToken);
    check('PATCH /api/admin/requests/:id -> 200, status updated', r.status === 200 && r.body.status === 'in_progress');

    r = await request('PATCH', `/api/admin/requests/${clientRequestId}`, { status: 'not-a-real-status' }, adminToken);
    check('PATCH /api/admin/requests/:id invalid status -> 400', r.status === 400);

    r = await request('PATCH', `/api/admin/requests/${clientRequestId}`, { status: 'completed' }, clientToken);
    check('PATCH /api/admin/requests/:id as client -> 403', r.status === 403);

    r = await request('GET', '/api/admin/messages', null, adminToken);
    check('GET /api/admin/messages as admin -> 200', r.status === 200);

    console.log('\nSite content CMS (admin-only, backend-enforced)');
    r = await request('POST', '/api/admin/content/services', { title: 'M&A Advisory', icon: 'fa-solid fa-handshake', summary: 'Deal structuring.', category: 'Advisory' }, adminToken);
    check('POST /api/admin/content/services (admin) -> 201', r.status === 201 && !!r.body.id);
    const newServiceId = r.body.id;

    r = await request('GET', '/api/services');
    check('GET /api/services -> now includes the new service (public, live)', r.status === 200 && r.body.some((s) => s.id === newServiceId));

    r = await request('PUT', `/api/admin/content/services/${newServiceId}`, { summary: 'Updated summary.' }, adminToken);
    check('PUT /api/admin/content/services/:id (admin) -> 200, updated', r.status === 200 && r.body.summary === 'Updated summary.');

    r = await request('POST', '/api/admin/content/services', { title: '', icon: '', summary: '', category: '' }, adminToken);
    check('POST /api/admin/content/services invalid -> 400', r.status === 400 && r.body.fields);

    r = await request('POST', '/api/admin/content/services', { title: 'x', icon: 'x', summary: 'x', category: 'x' }, clientToken);
    check('POST /api/admin/content/services as client -> 403', r.status === 403);

    r = await request('DELETE', `/api/admin/content/services/${newServiceId}`, null, adminToken);
    check('DELETE /api/admin/content/services/:id (admin) -> 200', r.status === 200 && r.body.deleted === true);

    r = await request('GET', '/api/settings');
    check('GET /api/settings (public) -> 200 with address', r.status === 200 && !!r.body.address);

    r = await request('PUT', '/api/admin/settings', { phone: '+254 700 999 888' }, adminToken);
    check('PUT /api/admin/settings (admin) -> 200, updated', r.status === 200 && r.body.phone === '+254 700 999 888');

    r = await request('PUT', '/api/admin/settings', { phone: '+254 700 000 000' }, companyToken);
    check('PUT /api/admin/settings as company -> 403', r.status === 403);

    console.log('\nJob applications — public submission + resume upload');
    const fakePdf = Buffer.from('%PDF-1.4 fake resume for automated testing');

    r = await requestMultipart('POST', '/api/careers/c3/apply', {
      name: 'Alice React', email: 'alice-test@example.com', yearsExperience: '6', education: 'bachelors',
      coverMessage: 'I have 6 years with react, javascript, css, html, very frontend focused.',
    }, 'resume', fakePdf, 'resume.pdf', 'application/pdf');
    check('POST /api/careers/c3/apply strong candidate -> 201, high autoScore', r.status === 201 && r.body.application.autoScore >= 70);
    const strongAppId = r.body.application.id;

    r = await requestMultipart('POST', '/api/careers/c3/apply', {
      name: 'Bob Newcomer', email: 'bob-test@example.com', yearsExperience: '0', education: 'high_school',
      coverMessage: 'Looking to switch careers into tech, no direct experience yet.',
    }, 'resume', fakePdf, 'resume.pdf', 'application/pdf');
    check('POST /api/careers/c3/apply weak candidate -> 201, low autoScore', r.status === 201 && r.body.application.autoScore < 40);
    const weakAppId = r.body.application.id;

    r = await requestMultipart('POST', '/api/careers/c3/apply', {
      name: 'No Resume', email: 'noresume@example.com', yearsExperience: '1', education: 'diploma', coverMessage: 'test',
    }, null, null, null, null);
    check('POST /api/careers/c3/apply without resume -> 400', r.status === 400 && r.body.fields && r.body.fields.resume);

    r = await requestMultipart('POST', '/api/careers/does-not-exist/apply', {
      name: 'X', email: 'x@example.com', yearsExperience: '1', education: 'diploma', coverMessage: 'x',
    }, 'resume', fakePdf, 'resume.pdf', 'application/pdf');
    check('POST /api/careers/:badId/apply -> 404', r.status === 404);

    r = await requestMultipart('POST', '/api/careers/c3/apply', {
      name: 'Bad Type', email: 'badtype@example.com', yearsExperience: '1', education: 'diploma', coverMessage: 'x',
    }, 'resume', Buffer.from('not a resume'), 'resume.txt', 'text/plain');
    check('POST /api/careers/c3/apply wrong file type -> 400', r.status === 400);

    console.log('\nAdmin — ranked applications, override, resume download');
    r = await request('GET', '/api/admin/applications?jobId=c3', null, adminToken);
    check('GET /api/admin/applications?jobId=c3 (admin) -> ranked, strong candidate first', r.status === 200 && r.body[0].id === strongAppId && r.body[0].rank === 1);

    r = await request('GET', '/api/admin/applications', null, clientToken);
    check('GET /api/admin/applications as client -> 403', r.status === 403);

    r = await request('GET', '/api/admin/applications/summary', null, adminToken);
    check('GET /api/admin/applications/summary (admin) -> includes c3 with correct count', r.status === 200 && r.body.find((s) => s.jobId === 'c3').count >= 2);

    r = await request('PATCH', `/api/admin/applications/${weakAppId}`, { adminScore: 90, status: 'shortlisted' }, adminToken);
    check('PATCH /api/admin/applications/:id override score -> 200', r.status === 200 && r.body.adminScore === 90 && r.body.effectiveScore === 90);

    r = await request('GET', '/api/admin/applications?jobId=c3', null, adminToken);
    check('GET ranked again -> overridden weak candidate now outranks strong one', r.status === 200 && r.body[0].id === weakAppId);

    r = await request('PATCH', `/api/admin/applications/${weakAppId}`, { adminScore: 150 }, adminToken);
    check('PATCH adminScore out of range -> 400', r.status === 400);

    r = await request('PATCH', `/api/admin/applications/${weakAppId}`, { status: 'shortlisted' }, clientToken);
    check('PATCH application status as client -> 403', r.status === 403);

    r = await request('GET', `/api/admin/applications/${strongAppId}/resume`, null, adminToken);
    check('GET resume download (admin) -> 200', r.status === 200);

    r = await request('GET', `/api/admin/applications/${strongAppId}/resume`);
    check('GET resume download without token -> 401', r.status === 401);

    console.log('\nSite copy, core values, and homepage stats (new CMS singletons/collection)');
    r = await request('GET', '/api/site-copy');
    check('GET /api/site-copy (public) -> has heroHeadlines', r.status === 200 && Array.isArray(r.body.heroHeadlines) && r.body.heroHeadlines.length > 0);

    r = await request('GET', '/api/core-values');
    check('GET /api/core-values (public) -> array of 4', r.status === 200 && Array.isArray(r.body) && r.body.length === 4);

    r = await request('PUT', '/api/admin/singleton/siteCopy', { heroHeadline: 'Testing New Headline Text' }, adminToken);
    check('PUT /api/admin/singleton/siteCopy (admin) -> 200, updated', r.status === 200 && r.body.heroHeadline === 'Testing New Headline Text');

    r = await request('GET', '/api/site-copy');
    check('GET /api/site-copy -> reflects the update live', r.status === 200 && r.body.heroHeadline === 'Testing New Headline Text');

    r = await request('PUT', '/api/admin/singleton/siteCopy', { heroHeadline: 'Transform Your Business with Data-Driven Solutions' }, adminToken);
    check('PUT /api/admin/singleton/siteCopy -> restored original', r.status === 200);

    r = await request('PUT', '/api/admin/singleton/stats', { successRate: '99%' }, adminToken);
    check('PUT /api/admin/singleton/stats (admin) -> 200, updated', r.status === 200 && r.body.successRate === '99%');

    r = await request('GET', '/api/stats');
    check('GET /api/stats -> reflects the update live', r.status === 200 && r.body.successRate === '99%');

    r = await request('PUT', '/api/admin/singleton/stats', { successRate: '97%' }, adminToken);
    check('PUT /api/admin/singleton/stats -> restored original', r.status === 200);

    r = await request('PUT', '/api/admin/singleton/siteCopy', { heroHeadline: 'x' }, clientToken);
    check('PUT /api/admin/singleton/siteCopy as client -> 403', r.status === 403);

    r = await request('PUT', '/api/admin/singleton/not-a-real-singleton', { x: 'y' }, adminToken);
    check('PUT /api/admin/singleton/:badName -> 404', r.status === 404);

    r = await request('POST', '/api/admin/content/coreValues', { title: 'Test Value', description: 'A test value.' }, adminToken);
    check('POST /api/admin/content/coreValues (admin) -> 201', r.status === 201 && !!r.body.id);
    const newValueId = r.body.id;

    r = await request('GET', '/api/core-values');
    check('GET /api/core-values -> now includes the new value, live', r.status === 200 && r.body.some((v) => v.id === newValueId));

    r = await request('DELETE', `/api/admin/content/coreValues/${newValueId}`, null, adminToken);
    check('DELETE /api/admin/content/coreValues/:id (admin) -> 200', r.status === 200 && r.body.deleted === true);

    console.log('\nStaff account management (admin-only)');
    const staffEmail = `staff-${Date.now()}@example.com`;
    r = await request('POST', '/api/admin/staff', { name: 'New Staffer', email: staffEmail, password: 'staffpass123' }, adminToken);
    check('POST /api/admin/staff (admin) -> 201, no passwordHash leaked', r.status === 201 && !!r.body.id && r.body.passwordHash === undefined);
    const newStaffId = r.body.id;

    r = await request('POST', '/api/auth/login', { email: staffEmail, password: 'staffpass123' });
    check('New staff account can log in with role=admin', r.status === 200 && r.body.user.role === 'admin');
    const newStaffToken = r.body.token;

    r = await request('GET', '/api/admin/summary', null, newStaffToken);
    check('New staff token has real admin access -> 200', r.status === 200);

    r = await request('GET', '/api/admin/staff', null, adminToken);
    check('GET /api/admin/staff (admin) -> includes the new staff account', r.status === 200 && r.body.some((s) => s.id === newStaffId));

    r = await request('POST', '/api/admin/staff', { name: 'x', email: 'not-an-email', password: '123' }, adminToken);
    check('POST /api/admin/staff invalid -> 400', r.status === 400 && r.body.fields);

    r = await request('POST', '/api/admin/staff', { name: 'x', email: staffEmail, password: 'password123' }, adminToken);
    check('POST /api/admin/staff duplicate email -> 409', r.status === 409);

    r = await request('POST', '/api/admin/staff', { name: 'x', email: 'sneaky@example.com', password: 'password123' }, clientToken);
    check('POST /api/admin/staff as client -> 403', r.status === 403);

    r = await request('DELETE', `/api/admin/staff/${adminUserId}`, null, adminToken);
    check('DELETE own admin account via staff route -> blocked with 400', r.status === 400);

    r = await request('DELETE', `/api/admin/staff/${newStaffId}`, null, adminToken);
    check('DELETE /api/admin/staff/:id (admin removes the new staffer) -> 200', r.status === 200 && r.body.deleted === true);

    r = await request('GET', '/api/admin/summary', null, newStaffToken);
    check('Removed staff token no longer has access -> 401 (revoked immediately, not just at token expiry)', r.status === 401);

    console.log('\nStaff categories, featured flag, and derived public Team');
    r = await request('GET', '/api/admin/staff/categories', null, adminToken);
    check('GET /api/admin/staff/categories -> includes CEO/CFO/Director/HR', r.status === 200 && ['CEO', 'CFO', 'Director', 'HR'].every((c) => r.body.includes(c)));

    r = await request('GET', '/api/team');
    check('GET /api/team (public) -> shows only featured seeded staff (4)', r.status === 200 && r.body.length === 4);

    r = await request('POST', '/api/admin/staff', { name: 'Junior Analyst', email: `junior-${Date.now()}@example.com`, password: 'password123', category: 'Staff', featured: false }, adminToken);
    check('POST /api/admin/staff not featured -> 201', r.status === 201 && r.body.featured === false);
    const juniorId = r.body.id;

    r = await request('GET', '/api/team');
    check('GET /api/team -> unfeatured staff does NOT appear (still 4)', r.status === 200 && r.body.length === 4);

    r = await request('PATCH', `/api/admin/staff/${juniorId}`, { featured: true }, adminToken);
    check('PATCH /api/admin/staff/:id feature them -> 200', r.status === 200 && r.body.featured === true);

    r = await request('GET', '/api/team');
    check('GET /api/team -> now shows 5, featuring took effect live', r.status === 200 && r.body.length === 5);

    r = await request('POST', '/api/admin/staff', { name: 'x', email: `bad-${Date.now()}@example.com`, password: 'password123', category: 'Wizard' }, adminToken);
    check('POST /api/admin/staff invalid category -> 400', r.status === 400);

    r = await request('DELETE', `/api/admin/staff/${juniorId}`, null, adminToken);
    check('DELETE /api/admin/staff/:id cleanup -> 200', r.status === 200);

    r = await request('GET', '/api/admin/content/team', null, adminToken);
    check('GET /api/admin/content/team -> 404 (team is no longer a standalone CRUD collection)', r.status === 404);

    console.log('\nImage/file uploads (admin-only) and photo fields going live on public content');
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    r = await requestMultipart('POST', '/api/admin/upload-image', {}, 'image', fakeJpeg, 'photo.jpg', 'image/jpeg', adminToken);
    check('POST /api/admin/upload-image -> 201 with url', r.status === 201 && !!r.body.url);
    const uploadedImageUrl = r.body.url;

    r = await request('GET', uploadedImageUrl);
    check('Uploaded image is publicly fetchable, no auth needed', r.status === 200);

    r = await requestMultipart('POST', '/api/admin/upload-image', {}, 'image', fakeJpeg, 'photo.jpg', 'image/jpeg');
    check('POST /api/admin/upload-image without token -> 401', r.status === 401);

    r = await requestMultipart('POST', '/api/admin/upload-image', {}, 'image', Buffer.from('not an image'), 'evil.exe', 'application/x-msdownload', adminToken);
    check('POST /api/admin/upload-image wrong mime type -> 400', r.status === 400);

    r = await request('PUT', '/api/admin/content/gallery/g1', { photoUrl: uploadedImageUrl }, adminToken);
    check('PUT gallery item with photoUrl -> 200', r.status === 200 && r.body.photoUrl === uploadedImageUrl);

    r = await request('GET', '/api/gallery');
    check('GET /api/gallery -> g1 shows the uploaded photo live', r.status === 200 && r.body.find((g) => g.id === 'g1').photoUrl === uploadedImageUrl);

    r = await request('PATCH', '/api/admin/staff/user-seed-admin', { photoUrl: uploadedImageUrl }, adminToken);
    check('PATCH staff photoUrl -> 200', r.status === 200 && r.body.photoUrl === uploadedImageUrl);

    r = await request('GET', '/api/team');
    check('GET /api/team -> Amina now shows the uploaded photo', r.status === 200 && r.body.find((t) => t.id === 'user-seed-admin').photoUrl === uploadedImageUrl);

    // Reset the photo fields we just set so the seed data stays clean for delivery.
    await request('PUT', '/api/admin/content/gallery/g1', { photoUrl: null }, adminToken);
    await request('PATCH', '/api/admin/staff/user-seed-admin', { photoUrl: null }, adminToken);

    const fakePdfForResource = Buffer.from('%PDF-1.4 fake resource file for testing');
    r = await requestMultipart('POST', '/api/admin/upload-file', {}, 'file', fakePdfForResource, 'guide.pdf', 'application/pdf', adminToken);
    check('POST /api/admin/upload-file (pdf) -> 201 with url', r.status === 201 && !!r.body.url);

    console.log('\nResources (public + admin CMS)');
    r = await request('GET', '/api/resources');
    check('GET /api/resources (public) -> 3 seeded resources', r.status === 200 && r.body.length === 3);

    r = await request('POST', '/api/admin/content/resources', { title: 'Test Resource', description: 'A test resource.', category: 'Guide' }, adminToken);
    check('POST /api/admin/content/resources -> 201', r.status === 201 && !!r.body.id);
    const resourceId = r.body.id;

    r = await request('GET', '/api/resources');
    check('GET /api/resources -> now includes the new one, live', r.status === 200 && r.body.some((res) => res.id === resourceId));

    r = await request('DELETE', `/api/admin/content/resources/${resourceId}`, null, adminToken);
    check('DELETE /api/admin/content/resources/:id -> 200', r.status === 200);

    console.log('\nRotating hero headlines (siteCopy singleton)');
    r = await request('GET', '/api/site-copy');
    check('GET /api/site-copy -> heroHeadlines is an array with 3 entries', r.status === 200 && Array.isArray(r.body.heroHeadlines) && r.body.heroHeadlines.length === 3);

    r = await request('PUT', '/api/admin/singleton/siteCopy', { heroHeadlines: [{ text: 'Temp Headline', accentWord: 'Temp' }] }, adminToken);
    check('PUT siteCopy heroHeadlines -> 200, updated', r.status === 200 && r.body.heroHeadlines.length === 1);

    r = await request('PUT', '/api/admin/singleton/siteCopy', {
      heroHeadlines: [
        { text: 'Transform Your Business with Data-Driven Solutions', accentWord: 'Data-Driven' },
        { text: 'Strategy That Survives Contact with the Balance Sheet', accentWord: 'Balance Sheet' },
        { text: 'From Boardroom Plan to Quarter-End Results', accentWord: 'Quarter-End Results' },
      ],
    }, adminToken);
    check('PUT siteCopy heroHeadlines -> restored to 3 original headlines', r.status === 200 && r.body.heroHeadlines.length === 3);

    console.log('\nOfficial email request workflow');
    r = await request('POST', '/api/email-requests', { requestedAddress: 'test@primeeliteventures.example', reason: 'Need it for client correspondence.' }, clientToken);
    check('POST /api/email-requests (client) -> 201, status=pending', r.status === 201 && r.body.status === 'pending');
    const emailReqId = r.body.id;

    r = await request('POST', '/api/email-requests', { reason: '' }, clientToken);
    check('POST /api/email-requests missing reason -> 400', r.status === 400 && r.body.fields);

    r = await request('POST', '/api/email-requests', { reason: 'test' });
    check('POST /api/email-requests without auth -> 401', r.status === 401);

    r = await request('GET', '/api/email-requests', null, clientToken);
    check('GET /api/email-requests (client) -> sees own request', r.status === 200 && r.body.some((er) => er.id === emailReqId));

    r = await request('GET', '/api/admin/email-requests', null, clientToken);
    check('GET /api/admin/email-requests as client -> 403', r.status === 403);

    r = await request('GET', '/api/admin/email-requests', null, adminToken);
    check('GET /api/admin/email-requests (admin) -> sees the request', r.status === 200 && r.body.some((er) => er.id === emailReqId));

    r = await request('PATCH', `/api/admin/email-requests/${emailReqId}`, { status: 'approved', adminNote: 'Provisioned.' }, adminToken);
    check('PATCH /api/admin/email-requests/:id (admin approves) -> 200', r.status === 200 && r.body.status === 'approved');

    r = await request('GET', '/api/email-requests', null, clientToken);
    check('GET /api/email-requests -> client sees approved status', r.status === 200 && r.body.find((er) => er.id === emailReqId).status === 'approved');

    r = await request('PATCH', `/api/admin/email-requests/${emailReqId}`, { status: 'not-a-status' }, adminToken);
    check('PATCH /api/admin/email-requests/:id invalid status -> 400', r.status === 400);

    console.log('\nEmail notifications on admin decisions');
    r = await request('GET', '/api/admin/notifications', null, adminToken);
    check('GET /api/admin/notifications (admin) -> array', r.status === 200 && Array.isArray(r.body));

    r = await request('GET', '/api/admin/notifications', null, clientToken);
    check('GET /api/admin/notifications as client -> 403', r.status === 403);

    check(
      'Approving the email request above triggered a notification email',
      (await request('GET', '/api/admin/notifications', null, adminToken)).body.some(
        (n) => n.to === clientEmail && n.subject.includes('official email request')
      )
    );

    r = await request('POST', '/api/requests', { service: 'Strategy & Advisory', details: 'Notification test request.' }, clientToken);
    const notifyTestRequestId = r.body.id;

    let logBefore = (await request('GET', '/api/admin/notifications', null, adminToken)).body.length;
    r = await request('PATCH', `/api/admin/requests/${notifyTestRequestId}`, { status: 'cancelled' }, adminToken);
    check('PATCH service request status -> 200', r.status === 200);
    let logAfter = (await request('GET', '/api/admin/notifications', null, adminToken)).body.length;
    check('Cancelling a service request sends exactly one notification', logAfter === logBefore + 1);

    const latestNotification = (await request('GET', '/api/admin/notifications', null, adminToken)).body[0];
    check(
      'That notification is addressed to the client and mentions "cancelled"',
      latestNotification.to === clientEmail && /cancelled/i.test(latestNotification.text)
    );

    logBefore = (await request('GET', '/api/admin/notifications', null, adminToken)).body.length;
    r = await request('PATCH', `/api/admin/requests/${notifyTestRequestId}`, { status: 'cancelled' }, adminToken);
    logAfter = (await request('GET', '/api/admin/notifications', null, adminToken)).body.length;
    check('Resubmitting the SAME status does NOT send a duplicate notification', logAfter === logBefore);

    const fakePdfForNotifyTest = Buffer.from('%PDF-1.4 fake resume for notification test');
    r = await requestMultipart('POST', '/api/careers/c1/apply', {
      name: 'Notify Test Applicant', email: 'notifytest@example.com', yearsExperience: '2', education: 'diploma',
      coverMessage: 'Testing notification behaviour.',
    }, 'resume', fakePdfForNotifyTest, 'resume.pdf', 'application/pdf');
    const notifyTestAppId = r.body.application.id;

    logBefore = (await request('GET', '/api/admin/notifications', null, adminToken)).body.length;
    r = await request('PATCH', `/api/admin/applications/${notifyTestAppId}`, { adminScore: 60 }, adminToken);
    check('PATCH application adminScore only -> 200', r.status === 200);
    logAfter = (await request('GET', '/api/admin/notifications', null, adminToken)).body.length;
    check('A score-only override does NOT send a notification', logAfter === logBefore);

    logBefore = (await request('GET', '/api/admin/notifications', null, adminToken)).body.length;
    r = await request('PATCH', `/api/admin/applications/${notifyTestAppId}`, { status: 'rejected' }, adminToken);
    check('PATCH application status -> 200', r.status === 200);
    logAfter = (await request('GET', '/api/admin/notifications', null, adminToken)).body.length;
    check('Rejecting an application sends exactly one notification', logAfter === logBefore + 1);

    const rejectionNotification = (await request('GET', '/api/admin/notifications', null, adminToken)).body[0];
    check(
      'That notification is addressed to the applicant and mentions the outcome',
      rejectionNotification.to === 'notifytest@example.com' && /not selected/i.test(rejectionNotification.text)
    );

    console.log('\nPermission system (categories, custom permissions, per-route gating)');
    r = await request('POST', '/api/auth/login', { email: 'admin@primeeliteventures.example', password: 'AdminPass123!' });
    check('Login response includes permissions array', Array.isArray(r.body.user.permissions) && r.body.user.permissions.length > 0);

    r = await request('GET', '/api/admin/staff/categories', null, adminToken);
    check('GET /api/admin/staff/categories -> includes Accountant', r.status === 200 && r.body.includes('Accountant'));

    r = await request('GET', '/api/admin/permissions', null, adminToken);
    check('GET /api/admin/permissions -> includes reports/invoices/bookings/partners', r.status === 200 && ['reports', 'invoices', 'bookings', 'partners'].every((p) => r.body.includes(p)));

    r = await request('POST', '/api/admin/staff', {
      name: 'Test HR', email: `hrtest-${Date.now()}@example.com`, password: 'password123', category: 'HR',
    }, adminToken);
    check('POST /api/admin/staff category=HR -> 201, gets HR default permissions', r.status === 201 && r.body.permissions.includes('staff') && !r.body.permissions.includes('content'));
    const hrTestId = r.body.id;
    const hrTestEmail = (await request('GET', '/api/admin/staff', null, adminToken)).body.find((s) => s.id === hrTestId).email;

    r = await request('POST', '/api/auth/login', { email: hrTestEmail, password: 'password123' });
    const hrTestToken = r.body.token;
    check('New HR account logs in with its category permissions', r.status === 200 && r.body.user.permissions.includes('staff'));

    r = await request('GET', '/api/admin/staff', null, hrTestToken);
    check('HR account CAN reach /api/admin/staff (has staff permission) -> 200', r.status === 200);

    r = await request('GET', '/api/admin/content/services', null, hrTestToken);
    check('HR account CANNOT reach Site Content (no content permission) -> 403', r.status === 403);

    r = await request('POST', '/api/admin/staff', {
      name: 'Test Accountant', email: `accttest-${Date.now()}@example.com`, password: 'password123', category: 'Accountant',
    }, adminToken);
    const acctTestId = r.body.id;
    check('POST /api/admin/staff category=Accountant -> gets reports/invoices/bookings, not staff', r.status === 201 && r.body.permissions.includes('invoices') && !r.body.permissions.includes('staff'));

    const acctTestEmail = (await request('GET', '/api/admin/staff', null, adminToken)).body.find((s) => s.id === acctTestId).email;
    r = await request('POST', '/api/auth/login', { email: acctTestEmail, password: 'password123' });
    const acctTestToken = r.body.token;

    r = await request('GET', '/api/admin/staff', null, acctTestToken);
    check('Accountant account CANNOT reach Staff Accounts -> 403', r.status === 403);

    r = await request('GET', '/api/admin/notifications', null, acctTestToken);
    check('Accountant account CAN reach reports/notifications -> 200', r.status === 200);

    r = await request('PATCH', `/api/admin/staff/${hrTestId}`, { permissions: ['content'] }, adminToken);
    check('PATCH staff permissions -> custom override applied', r.status === 200 && r.body.permissions.includes('content') && !r.body.permissions.includes('staff'));

    r = await request('GET', '/api/admin/content/services', null, hrTestToken);
    check('HR account NOW reaches Site Content after permission override -> 200', r.status === 200);

    r = await request('GET', '/api/admin/staff', null, hrTestToken);
    check('HR account NO LONGER reaches Staff Accounts after override removed it -> 403', r.status === 403);

    await request('DELETE', `/api/admin/staff/${hrTestId}`, null, adminToken);
    await request('DELETE', `/api/admin/staff/${acctTestId}`, null, adminToken);

    console.log('\nDual apply system: Services and Projects');
    r = await request('GET', '/api/projects');
    check('GET /api/projects (public) -> 3 seeded projects', r.status === 200 && r.body.length === 3);

    r = await request('POST', '/api/requests', { service: 'Retail POS Modernisation', details: 'Test project interest.', type: 'project' }, clientToken);
    check('POST /api/requests type=project -> 201, type stored', r.status === 201 && r.body.type === 'project');
    const testProjectReqId = r.body.id;

    r = await request('POST', '/api/requests', { service: 'Strategy & Advisory', details: 'Test service interest.' }, clientToken);
    check('POST /api/requests without type -> defaults to type=service', r.status === 201 && r.body.type === 'service');

    r = await request('GET', '/api/admin/requests?type=project', null, adminToken);
    check('GET /api/admin/requests?type=project -> only project-type requests', r.status === 200 && r.body.every((req) => req.type === 'project'));

    r = await request('POST', '/api/admin/content/projects', { title: 'Test Project', icon: 'fa-solid fa-star', category: 'Test', summary: 'A test project.' }, adminToken);
    check('POST /api/admin/content/projects (admin) -> 201', r.status === 201 && !!r.body.id);
    const testProjectId = r.body.id;

    r = await request('GET', '/api/projects');
    check('GET /api/projects -> includes the new project, live', r.status === 200 && r.body.some((p) => p.id === testProjectId));

    await request('DELETE', `/api/admin/content/projects/${testProjectId}`, null, adminToken);

    console.log('\nPartner applications');
    r = await request('POST', '/api/partners/apply', {
      name: 'Test Partner', email: 'testpartner@example.com', organization: 'TestCo', partnershipType: 'Referral partner', message: 'We would like to partner.',
    });
    check('POST /api/partners/apply (public, no auth) -> 201', r.status === 201 && !!r.body.id);
    const partnerAppId = r.body.id;

    r = await request('POST', '/api/partners/apply', { name: '', email: 'bad', message: '' });
    check('POST /api/partners/apply invalid -> 400', r.status === 400 && r.body.fields);

    r = await request('GET', '/api/admin/partners', null, clientToken);
    check('GET /api/admin/partners as client -> 403', r.status === 403);

    r = await request('GET', '/api/admin/partners', null, adminToken);
    check('GET /api/admin/partners (admin) -> sees the new application', r.status === 200 && r.body.some((p) => p.id === partnerAppId));

    r = await request('PATCH', `/api/admin/partners/${partnerAppId}`, { status: 'approved', adminNote: 'Good fit.' }, adminToken);
    check('PATCH /api/admin/partners/:id approve -> 200', r.status === 200 && r.body.status === 'approved');

    r = await request('PATCH', `/api/admin/partners/${partnerAppId}`, { status: 'not-a-status' }, adminToken);
    check('PATCH /api/admin/partners/:id invalid status -> 400', r.status === 400);

    console.log('\nIn-app notifications');
    r = await request('GET', '/api/notifications', null, clientToken);
    check('GET /api/notifications (client) -> has notifications + unreadCount shape', r.status === 200 && Array.isArray(r.body.notifications) && typeof r.body.unreadCount === 'number');

    const unreadBefore = (await request('GET', '/api/notifications', null, clientToken)).body.unreadCount;
    r = await request('PATCH', `/api/admin/requests/${testProjectReqId}`, { status: 'completed' }, adminToken);
    check('PATCH request status (triggers notification) -> 200', r.status === 200);

    const afterNotify = await request('GET', '/api/notifications', null, clientToken);
    check('Client now has one more unread in-app notification', afterNotify.body.unreadCount === unreadBefore + 1);
    check('The new notification mentions the project and "completed"', afterNotify.body.notifications[0].title.includes('Retail POS') && /completed/i.test(afterNotify.body.notifications[0].body));

    const notifId = afterNotify.body.notifications[0].id;
    r = await request('PATCH', `/api/notifications/${notifId}/read`, null, clientToken);
    check('PATCH /api/notifications/:id/read -> 200, marked read', r.status === 200 && r.body.read === true);

    r = await request('PATCH', `/api/notifications/${notifId}/read`, null, companyToken);
    check('A DIFFERENT user cannot mark someone else\'s notification read -> 404', r.status === 404);

    r = await request('GET', '/api/notifications');
    check('GET /api/notifications without auth -> 401', r.status === 401);

    r = await request('POST', '/api/notifications/mark-all-read', null, clientToken);
    check('POST /api/notifications/mark-all-read -> 200', r.status === 200);

    const afterMarkAll = await request('GET', '/api/notifications', null, clientToken);
    check('After mark-all-read, unreadCount is 0', afterMarkAll.body.unreadCount === 0);

    console.log('\nBookings');
    r = await request('POST', '/api/bookings', { topic: 'Discuss Q4 roadmap', preferredDate: '2026-11-01', preferredTime: '14:00', notes: 'Video call preferred.' }, clientToken);
    check('POST /api/bookings (client) -> 201', r.status === 201 && r.body.status === 'pending');
    const testBookingId = r.body.id;

    r = await request('POST', '/api/bookings', { preferredDate: '2026-11-01' }, clientToken);
    check('POST /api/bookings missing topic -> 400', r.status === 400 && r.body.fields);

    r = await request('POST', '/api/bookings', { topic: 'x', preferredDate: '2026-11-01' });
    check('POST /api/bookings without auth -> 401', r.status === 401);

    r = await request('GET', '/api/bookings', null, clientToken);
    check('GET /api/bookings (client) -> sees own booking', r.status === 200 && r.body.some((b) => b.id === testBookingId));

    r = await request('GET', '/api/admin/bookings', null, clientToken);
    check('GET /api/admin/bookings as client -> 403 (wrong role entirely)', r.status === 403);

    const acctLoginRes = await request('POST', '/api/auth/login', { email: 'f.nyambura@primeeliteventures.example', password: 'StaffPass123!' });
    const acctToken = acctLoginRes.body.token;
    check('Accountant login includes bookings/invoices/reports permissions', acctLoginRes.body.user.permissions.includes('bookings') && acctLoginRes.body.user.permissions.includes('invoices') && acctLoginRes.body.user.permissions.includes('reports'));

    r = await request('GET', '/api/admin/bookings', null, acctToken);
    check('GET /api/admin/bookings (Accountant) -> sees the booking', r.status === 200 && r.body.some((b) => b.id === testBookingId));

    const hrLoginForBookings = await request('POST', '/api/auth/login', { email: 'hr@primeeliteventures.example', password: 'StaffPass123!' });
    r = await request('GET', '/api/admin/bookings', null, hrLoginForBookings.body.token);
    check('GET /api/admin/bookings as HR (no bookings permission) -> 403', r.status === 403);

    r = await request('PATCH', `/api/admin/bookings/${testBookingId}`, { status: 'confirmed' }, acctToken);
    check('PATCH /api/admin/bookings/:id confirm -> 200', r.status === 200 && r.body.status === 'confirmed');

    const bookingNotifCheck = await request('GET', '/api/notifications', null, clientToken);
    check('Confirming a booking sends the client a notification', bookingNotifCheck.body.notifications.some((n) => n.title.includes('booking') && n.title.includes('confirmed')));

    r = await request('PATCH', `/api/admin/bookings/${testBookingId}`, { status: 'not-a-status' }, acctToken);
    check('PATCH /api/admin/bookings/:id invalid status -> 400', r.status === 400);

    console.log('\nInvoices');
    const meRes = await request('GET', '/api/auth/me', null, clientToken);
    const clientUserId = meRes.body.user.id;

    r = await request('POST', '/api/admin/invoices', { userId: clientUserId, description: 'Test retainer', amount: 1500, currency: 'USD', dueDate: '2026-12-01' }, acctToken);
    check('POST /api/admin/invoices (Accountant) -> 201 with invoice number', r.status === 201 && /^INV-\d{4}-\d{4}$/.test(r.body.invoiceNumber));
    const testInvoiceId = r.body.id;

    r = await request('POST', '/api/admin/invoices', { userId: clientUserId, description: 'x', amount: -10, dueDate: '2026-12-01' }, acctToken);
    check('POST /api/admin/invoices negative amount -> 400', r.status === 400 && r.body.fields);

    r = await request('POST', '/api/admin/invoices', { userId: 'not-a-real-user', description: 'x', amount: 100, dueDate: '2026-12-01' }, acctToken);
    check('POST /api/admin/invoices invalid userId -> 400', r.status === 400 && r.body.fields);

    r = await request('POST', '/api/admin/invoices', { userId: clientUserId, description: 'x', amount: 100, dueDate: '2026-12-01' }, hrLoginForBookings.body.token);
    check('POST /api/admin/invoices as HR (no invoices permission) -> 403', r.status === 403);

    r = await request('GET', '/api/invoices', null, clientToken);
    check('GET /api/invoices (client) -> sees the new invoice', r.status === 200 && r.body.some((inv) => inv.id === testInvoiceId));

    const invoiceNotifCheck = await request('GET', '/api/notifications', null, clientToken);
    check('Creating an invoice notifies the client', invoiceNotifCheck.body.notifications.some((n) => n.title.includes('New invoice')));

    r = await request('GET', '/api/admin/users', null, acctToken);
    check('Accountant (has invoices, not users) still reaches /api/admin/users to pick an invoice recipient', r.status === 200);

    r = await request('PATCH', `/api/admin/invoices/${testInvoiceId}`, { status: 'paid' }, acctToken);
    check('PATCH /api/admin/invoices/:id mark paid -> 200', r.status === 200 && r.body.status === 'paid');

    console.log('\nReports (generate + export, permission-gated)');
    r = await request('GET', '/api/admin/reports/types', null, acctToken);
    check('GET /api/admin/reports/types -> includes bookings/invoices/partners', r.status === 200 && ['bookings', 'invoices', 'partners'].every((t) => r.body.includes(t)));

    r = await request('GET', '/api/admin/reports?type=invoices', null, acctToken);
    check('GET /api/admin/reports?type=invoices -> has rowCount and financial breakdown', r.status === 200 && r.body.rowCount >= 1 && typeof r.body.breakdown.totalAmount === 'number');

    r = await request('GET', '/api/admin/reports?type=bookings', null, acctToken);
    check('GET /api/admin/reports?type=bookings -> byStatus breakdown present', r.status === 200 && !!r.body.breakdown.byStatus);

    r = await request('GET', '/api/admin/reports?type=invoices&from=2030-01-01&to=2030-12-31', null, acctToken);
    check('Date-range filter with a future range -> 0 rows', r.status === 200 && r.body.rowCount === 0);

    r = await request('GET', '/api/admin/reports?type=nonsense', null, acctToken);
    check('GET /api/admin/reports invalid type -> 400', r.status === 400);

    r = await request('GET', '/api/admin/reports?type=invoices', null, hrLoginForBookings.body.token);
    check('HR (has reports permission) can also generate reports -> 200', r.status === 200);

    r = await request('GET', '/api/admin/reports?type=invoices', null, clientToken);
    check('Client cannot reach reports -> 403 (wrong role)', r.status === 403);

    r = await request('GET', '/api/admin/reports/export?type=invoices', null, acctToken);
    check('GET /api/admin/reports/export -> 200, CSV content-type', r.status === 200 && r.raw.includes('invoiceNumber'));

    console.log('\nRegression: routes sharing the /api/admin prefix no longer block each other');
    r = await request('GET', '/api/admin/applications', null, hrLoginForBookings.body.token);
    check('HR (has applications permission) reaches /api/admin/applications -> 200 (previously broken by an over-broad permission check)', r.status === 200);

    r = await request('GET', '/api/admin/content/services', null, acctToken);
    check('Accountant (no content permission) still correctly blocked from Site Content -> 403', r.status === 403);

    console.log('\nStatic pages — all three portals + redirector');
    r = await request('GET', '/');
    check('GET / -> 200 HTML', r.status === 200 && r.raw.includes('<title>'));

    r = await request('GET', '/login');
    check('GET /login -> 200', r.status === 200);

    r = await request('GET', '/register');
    check('GET /register -> 200', r.status === 200);

    r = await request('GET', '/portal-client');
    check('GET /portal-client -> 200', r.status === 200);

    r = await request('GET', '/portal-company');
    check('GET /portal-company -> 200', r.status === 200);

    r = await request('GET', '/admin');
    check('GET /admin -> 200', r.status === 200);

    r = await request('GET', '/dashboard');
    check('GET /dashboard -> 200 (legacy redirector)', r.status === 200);

    r = await request('GET', '/api/does-not-exist');
    check('GET /api/does-not-exist -> 404 (not SPA fallback)', r.status === 404);
  } finally {
    server.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

run();
