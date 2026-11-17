// Local test harness — runs the server against an in-memory Postgres (pg-mem),
// then exercises the real HTTP API end to end. NOT used in production.
// Usage: DATABASE_URL=memory SESSION_SECRET=test-secret node test-local.js
'use strict';
const { spawn } = require('child_process');
const http = require('http');

const PORT = 3456;
const base = `http://127.0.0.1:${PORT}`;
let cookies = '';
function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(base + path, {
      method,
      headers: { 'Content-Type': 'application/json', ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}), ...(cookies ? { Cookie: cookies } : {}) },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => { buf += c; });
      res.on('end', () => {
        const sc = res.headers['set-cookie'];
        if (sc) cookies = sc.map((c) => c.split(';')[0]).join('; ');
        resolve({ status: res.statusCode, body: buf, json: (() => { try { return JSON.parse(buf); } catch { return null; } })() });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const check = (name, cond, extra) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  — ' + extra : ''}`);
  if (!cond) process.exitCode = 1;
};
async function waitForServer(tries = 40) {
  for (let i = 0; i < tries; i++) {
    try { const r = await req('GET', '/api/health'); if (r.status === 200) return r; } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('server did not come up');
}
(async () => {
  const env = { ...process.env, DATABASE_URL: 'memory', SESSION_SECRET: 'test-secret', ADMIN_PASSWORD: 'TestAdmin123', PORT: String(PORT) };
  const child = spawn('node', ['server.js'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  try {
    const health = await waitForServer();
    check('GET /api/health returns 200', health.status === 200);
    check('seeded jobs = 39', health.json && health.json.jobs === 39, `got ${health.json && health.json.jobs}`);
    const home = await req('GET', '/');
    check('GET / homepage returns 200', home.status === 200, `len=${home.body.length}`);
    check('homepage contains Staffora Jobs', home.body.includes('Staffora Jobs'));
    const jobs = await req('GET', '/api/jobs');
    check('GET /api/jobs returns 39 jobs', jobs.json && jobs.json.jobs && jobs.json.jobs.length === 39, `got ${jobs.json && jobs.json.jobs && jobs.json.jobs.length}`);
    check('Farnek job present', jobs.json.jobs.some((j) => j.company === 'Farnek' && j.salaryMin === 1050 && j.salaryMax === 1350 && j.vacancies === 100));
    check('countries include UAE/Oman/Bahrain/Russia/Saudi Arabia', ['UAE', 'Oman', 'Bahrain', 'Russia', 'Saudi Arabia'].every((c) => jobs.json.countries.includes(c)), jobs.json.countries.join(','));
    const filtered = await req('GET', '/api/jobs?country=UAE');
    check('country filter UAE returns only UAE', filtered.json.jobs.every((j) => j.country === 'UAE') && filtered.json.jobs.length > 20, `got ${filtered.json.jobs.length}`);
    const searched = await req('GET', '/api/jobs?query=Welder');
    check('search "Welder" finds jobs', searched.json.jobs.length > 0, `got ${searched.json.jobs.length}`);
    const sorted = await req('GET', '/api/jobs?sort=salary_desc');
    check('salary_desc sort is descending', sorted.json.jobs[0].salaryMax >= sorted.json.jobs[sorted.json.jobs.length - 1].salaryMax, `${sorted.json.jobs[0].salaryMax} -> ${sorted.json.jobs[sorted.json.jobs.length - 1].salaryMax}`);
    // Admin login (seeded from ADMIN_PASSWORD env)
    const adminLogin = await req('POST', '/api/auth/login', { mobile: '9546450997', password: 'TestAdmin123' });
    check('admin login with seeded ADMIN_PASSWORD works', adminLogin.status === 200 && adminLogin.json.user && adminLogin.json.user.role === 'admin', `status=${adminLogin.status}`);
    // Candidate signup + login persistence
    cookies = '';
    const signup = await req('POST', '/api/auth/signup', { name: 'Test Candidate', mobile: '9876543210', password: 'secret123', trade: 'Welder' });
    check('candidate signup works', signup.status === 200 && signup.json.user && signup.json.user.role === 'candidate', `status=${signup.status}`);
    const me = await req('GET', '/api/auth/me');
    check('session persists after signup (me)', me.json && me.json.user && me.json.user.mobile === '9876543210');
    // Save + apply flow (job id 1 = Farnek)
    const save = await req('POST', '/api/jobs/1/toggle-save', {});
    check('save job works', save.json && save.json.saved === true);
    const saved = await req('GET', '/api/saved');
    check('saved list returns the job', saved.json.jobs.length === 1 && saved.json.jobs[0].id === 1);
    const apply = await req('POST', '/api/jobs/1/apply', {});
    check('apply saves application + returns WhatsApp link', apply.json && apply.json.whatsappUrl && apply.json.whatsappUrl.includes('wa.me/919546450997'), apply.json && apply.json.whatsappUrl);
    const mine = await req('GET', '/api/applications/mine');
    check('my applications lists the application', mine.json.applications.length === 1 && mine.json.applications[0].status === 'applied');
    // Admin: post a job, list applications, change status
    cookies = '';
    await req('POST', '/api/auth/login', { mobile: '9546450997', password: 'TestAdmin123' });
    const posted = await req('POST', '/api/admin/jobs', { title: 'Test Job Local', company: 'TestCo', country: 'UAE', trade: 'Helper', salaryMin: 1000, salaryMax: 1200 });
    check('admin can post a job', posted.status === 200 && posted.json.job && posted.json.job.id, `status=${posted.status}`);
    const apps = await req('GET', '/api/admin/applications');
    check('admin sees applications', apps.json.applications.length === 1 && apps.json.applications[0].candidate_mobile === '9876543210');
    const upd = await req('PUT', `/api/admin/applications/${apps.json.applications[0].id}`, { status: 'shortlisted' });
    check('admin can change application status', upd.json.application.status === 'shortlisted');
    // Admin signup must require staff code
    cookies = '';
    const badAdmin = await req('POST', '/api/auth/signup', { name: 'Bad Admin', mobile: '9999999999', password: 'secret123', role: 'admin', staffCode: '00000' });
    check('admin signup with wrong staff code is rejected', badAdmin.status === 403, `status=${badAdmin.status}`);
    // Google config endpoint + Google login with no/invalid token
    const cfg = await req('GET', '/api/config');
    check('GET /api/config returns the Google Client ID', cfg.json.googleClientId === '277314253222-qdmo82233tmvqmvlq7vtfjuc9tc5h5o3.apps.googleusercontent.com');
    const gBad = await req('POST', '/api/auth/google', { idToken: 'not-a-real-token' });
    check('Google login with a fake token is rejected', gBad.status === 401, `status=${gBad.status}`);
    console.log(process.exitCode ? 'SOME TESTS FAILED' : 'ALL LOCAL TESTS PASSED');
    console.log('--- server log ---');
    console.log(out);
  } catch (e) {
    console.error('TEST HARNESS ERROR:', e);
    console.log('--- server log ---');
    console.log(out);
    process.exitCode = 1;
  } finally {
    child.kill();
  }
})();
