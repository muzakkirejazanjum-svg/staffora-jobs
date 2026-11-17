// Staffora Jobs — standalone deployable app (Render free web service + Neon free Postgres)
// Run with only DATABASE_URL (+ SESSION_SECRET) as env vars. See README.md.
'use strict';
const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const session = require('express-session');

const PORT = parseInt(process.env.PORT || '3000', 10);
const DATABASE_URL = process.env.DATABASE_URL || '';
const SESSION_SECRET = process.env.SESSION_SECRET || '';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '277314253222-qdmo82233tmvqmvlq7vtfjuc9tc5h5o3.apps.googleusercontent.com';
const ADMIN_MOBILE = process.env.ADMIN_MOBILE || '9546450997';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const STAFF_CODE = process.env.STAFF_CODE || '50997';
const WHATSAPP_NUMBER = process.env.WHATSAPP_NUMBER || '919546450997';
const IS_PROD = process.env.NODE_ENV === 'production';
const IS_MEMORY = DATABASE_URL === 'memory'; // local test only — never used in production

if (!IS_MEMORY && !DATABASE_URL) {
  console.error('FATAL: DATABASE_URL env var is required (Neon Postgres connection string).');
  process.exit(1);
}
if (IS_PROD && !SESSION_SECRET) {
  console.error('FATAL: SESSION_SECRET env var is required in production.');
  process.exit(1);
}

let pool; // pg Pool (real Postgres) or pg-mem adapter pool (local test only)
let sessionStore;
async function initDb() {
  if (IS_MEMORY) {
    // Local-test only: in-memory Postgres-compatible DB. Not used on any host.
    const { newDb } = require('pg-mem');
    const db = newDb();
    const { Pool } = db.adapters.createPg();
    pool = new Pool();
    sessionStore = undefined; // express-session default MemoryStore (local test only)
  } else {
    const { Pool } = require('pg');
    const needsSsl = /neon\.tech|sslmode=require/i.test(DATABASE_URL);
    pool = new Pool({
      connectionString: DATABASE_URL,
      ssl: needsSsl ? { rejectUnauthorized: false } : false,
      max: 5,
    });
    pool.on('error', (e) => console.error('pg pool error', e.message));
    const PgSession = require('connect-pg-simple')(session);
    sessionStore = new PgSession({ pool, tableName: 'session', createTableIfMissing: true });
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL,
  mobile VARCHAR(15) UNIQUE,
  email VARCHAR(160) UNIQUE,
  password_hash TEXT,
  role VARCHAR(20) NOT NULL DEFAULT 'candidate',
  trade VARCHAR(80),
  experience_years INT,
  gulf_experience BOOLEAN,
  passport_status VARCHAR(80),
  google_sub VARCHAR(200) UNIQUE,
  auth_provider VARCHAR(20) NOT NULL DEFAULT 'password',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS jobs (
  id SERIAL PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  company VARCHAR(120) NOT NULL,
  country VARCHAR(60) NOT NULL,
  city VARCHAR(60),
  trade VARCHAR(80) NOT NULL,
  salary_min INT,
  salary_max INT,
  salary_currency VARCHAR(8) NOT NULL DEFAULT 'AED',
  salary_period VARCHAR(20) NOT NULL DEFAULT 'month',
  vacancies INT,
  benefits TEXT,
  description TEXT,
  duty_info TEXT,
  requirements TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS saved_jobs (
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, job_id)
);
CREATE TABLE IF NOT EXISTS applications (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id INT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'applied',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, job_id)
);
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(80) PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_country ON jobs(country);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_applications_job ON applications(job_id);
`;

async function seed() {
  // Seed jobs only when the jobs table is empty (never overwrites admin posts).
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM jobs');
  if (rows[0].n === 0) {
    const seedJobs = JSON.parse(fs.readFileSync(path.join(__dirname, 'jobs.json'), 'utf8'));
    for (const j of seedJobs) {
      await pool.query(
        `INSERT INTO jobs (title, company, country, city, trade, salary_min, salary_max,
          salary_currency, salary_period, vacancies, benefits, description, duty_info, requirements, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [j.title, j.company, j.country, j.city || null, j.trade, j.salaryMin || null, j.salaryMax || null,
          j.salaryCurrency || 'AED', j.salaryPeriod || 'month', j.vacancies || null, j.benefits || null,
          j.description || null, j.dutyInfo || null, j.requirements || null, j.status || 'open']
      );
    }
    console.log(`Seeded ${seedJobs.length} jobs from jobs.json`);
  }
  // Seed Google Client ID setting (env wins only when nothing is stored yet).
  await pool.query(
    `INSERT INTO settings (key, value) VALUES ('google_client_id', $1)
     ON CONFLICT (key) DO NOTHING`, [GOOGLE_CLIENT_ID]
  );
  // Seed the admin account ONLY from the ADMIN_PASSWORD env var; the password is
  // never written to any file. If ADMIN_PASSWORD is unset, no admin is created
  // here — sign up in the app as admin with the staff code instead.
  if (ADMIN_PASSWORD) {
    const existing = await pool.query('SELECT id FROM users WHERE mobile = $1', [ADMIN_MOBILE]);
    if (existing.rows.length === 0) {
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
      await pool.query(
        `INSERT INTO users (name, mobile, password_hash, role, auth_provider)
         VALUES ($1, $2, $3, 'admin', 'password')`,
        ['Muzakkir Ejaz Anjum', ADMIN_MOBILE, hash]
      );
      console.log('Seeded admin account for mobile ' + ADMIN_MOBILE + ' (password from ADMIN_PASSWORD env var)');
    }
  }
}

function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, mobile: u.mobile, email: u.email, role: u.role,
    trade: u.trade, experienceYears: u.experience_years, gulfExperience: u.gulf_experience,
    passportStatus: u.passport_status, authProvider: u.auth_provider,
  };
}
function jobRow(r) {
  return {
    id: r.id, title: r.title, company: r.company, country: r.country, city: r.city,
    trade: r.trade, salaryMin: r.salary_min, salaryMax: r.salary_max,
    salaryCurrency: r.salary_currency, salaryPeriod: r.salary_period, vacancies: r.vacancies,
    benefits: r.benefits, description: r.description, dutyInfo: r.duty_info,
    requirements: r.requirements, status: r.status, createdAt: r.created_at,
  };
}
function whatsappUrl(job, user) {
  const text = `Hi Staffora, I want to apply for ${job.title} (${job.company}). My name: ${user.name || ''}, Mobile: ${user.mobile || ''}, Trade: ${user.trade || job.trade}.`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

function authRequired(req, res, next) {
  if (!req.session || !req.session.userId) return res.status(401).json({ ok: false, error: 'Login required' });
  next();
}
async function loadUser(req, res, next) {
  if (req.session && req.session.userId) {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.session.userId]);
    req.user = rows[0] || null;
  } else req.user = null;
  next();
}
function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Sirf Staffora admin' });
  }
  next();
}
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function registerRoutes() {
  // ---------- public API ----------
  app.get('/api/health', asyncH(async (req, res) => {
    const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM jobs');
    res.json({ ok: true, jobs: rows[0].n });
  }));
  app.get('/api/config', asyncH(async (req, res) => {
    const { rows } = await pool.query(`SELECT value FROM settings WHERE key = 'google_client_id'`);
    res.json({ ok: true, googleClientId: rows[0] ? rows[0].value : null });
  }));
  app.get('/api/jobs', asyncH(async (req, res) => {
    const q = (req.query.query || '').toString().trim();
    const country = (req.query.country || '').toString();
    const trade = (req.query.trade || '').toString();
    const sort = (req.query.sort || 'newest').toString();
    const conds = [`status = 'open'`];
    const params = [];
    if (country) { params.push(country); conds.push(`country = $${params.length}`); }
    if (q) {
      params.push(`%${q}%`);
      conds.push(`(title ILIKE $${params.length} OR company ILIKE $${params.length} OR description ILIKE $${params.length} OR trade ILIKE $${params.length})`);
    }
    if (trade) {
      params.push(`%${trade}%`);
      conds.push(`(trade ILIKE $${params.length} OR title ILIKE $${params.length} OR description ILIKE $${params.length})`);
    }
    const order = sort === 'salary_desc' ? 'salary_max DESC NULLS LAST, id DESC'
      : sort === 'salary_asc' ? 'salary_min ASC NULLS LAST, id DESC' : 'id DESC';
    const { rows } = await pool.query(
      `SELECT * FROM jobs WHERE ${conds.join(' AND ')} ORDER BY ${order} LIMIT 200`, params);
    const countries = await pool.query(`SELECT DISTINCT country FROM jobs WHERE status='open' ORDER BY country`);
    res.json({ ok: true, jobs: rows.map(jobRow), countries: countries.rows.map((r) => r.country) });
  }));
  app.get('/api/jobs/:id', asyncH(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM jobs WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Job nahi mila' });
    res.json({ ok: true, job: jobRow(rows[0]) });
  }));

  // ---------- auth ----------
  app.post('/api/auth/signup', asyncH(async (req, res) => {
    const { name, mobile, password, role, staffCode, trade } = req.body || {};
    if (!name || String(name).trim().length < 2) return res.status(400).json({ ok: false, error: 'Naam likho' });
    if (!mobile || !/^[0-9]{10,15}$/.test(String(mobile))) return res.status(400).json({ ok: false, error: 'Sahi mobile number likho (10-15 digits)' });
    if (!password || String(password).length < 6) return res.status(400).json({ ok: false, error: 'Password kam se kam 6 characters ka ho' });
    let finalRole = 'candidate';
    if (role === 'admin') {
      if (staffCode !== STAFF_CODE) return res.status(403).json({ ok: false, error: 'Galat staff code — admin account nahi banega' });
      finalRole = 'admin';
    }
    const hash = await bcrypt.hash(String(password), 10);
    try {
      const { rows } = await pool.query(
        `INSERT INTO users (name, mobile, password_hash, role, trade, auth_provider)
         VALUES ($1,$2,$3,$4,$5,'password') RETURNING *`,
        [String(name).trim(), String(mobile), hash, finalRole, trade ? String(trade) : null]);
      req.session.userId = rows[0].id;
      res.json({ ok: true, user: publicUser(rows[0]) });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Is mobile par account pehle se hai — login karo' });
      throw e;
    }
  }));
  app.post('/api/auth/login', asyncH(async (req, res) => {
    const { mobile, password } = req.body || {};
    const { rows } = await pool.query('SELECT * FROM users WHERE mobile = $1', [String(mobile || '')]);
    const u = rows[0];
    if (!u || !u.password_hash) return res.status(401).json({ ok: false, error: 'Mobile ya password galat hai' });
    if (!(await bcrypt.compare(String(password || ''), u.password_hash))) {
      return res.status(401).json({ ok: false, error: 'Mobile ya password galat hai' });
    }
    req.session.userId = u.id;
    res.json({ ok: true, user: publicUser(u) });
  }));
  app.post('/api/auth/google', asyncH(async (req, res) => {
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ ok: false, error: 'Google token nahi mila' });
    const { rows: cfg } = await pool.query(`SELECT value FROM settings WHERE key = 'google_client_id'`);
    const clientId = cfg[0] ? cfg[0].value : GOOGLE_CLIENT_ID;
    if (!clientId) return res.status(400).json({ ok: false, error: 'Google login setup nahi hai — admin se Client ID add karwao' });
    let payload;
    try {
      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client(clientId);
      const ticket = await client.verifyIdToken({ idToken, audience: clientId });
      payload = ticket.getPayload();
    } catch (e) {
      return res.status(401).json({ ok: false, error: 'Google token verify nahi hua — dobara try karo' });
    }
    const sub = payload.sub, email = payload.email || null, name = payload.name || 'Candidate';
    let user;
    const bySub = await pool.query('SELECT * FROM users WHERE google_sub = $1', [sub]);
    if (bySub.rows[0]) user = bySub.rows[0];
    else if (email) {
      const byEmail = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
      if (byEmail.rows[0]) {
        user = byEmail.rows[0];
        await pool.query('UPDATE users SET google_sub = $1, auth_provider = $2 WHERE id = $3', [sub, 'google', user.id]);
      }
    }
    if (!user) {
      try {
        const ins = await pool.query(
          `INSERT INTO users (name, email, google_sub, auth_provider, role)
           VALUES ($1,$2,$3,'google','candidate') RETURNING *`, [name, email, sub]);
        user = ins.rows[0];
      } catch (e) {
        if (e.code === '23505' && email) {
          const retry = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
          user = retry.rows[0];
          await pool.query('UPDATE users SET google_sub = $1 WHERE id = $2', [sub, user.id]);
        } else throw e;
      }
    }
    req.session.userId = user.id;
    res.json({ ok: true, user: publicUser(user), needsMobile: !user.mobile });
  }));
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });
  app.get('/api/auth/me', loadUser, (req, res) => res.json({ ok: true, user: publicUser(req.user) }));
  app.put('/api/profile', loadUser, authRequired, asyncH(async (req, res) => {
    const { name, mobile, trade, experienceYears, gulfExperience, passportStatus } = req.body || {};
    if (mobile !== undefined && mobile !== null && mobile !== '' && !/^[0-9]{10,15}$/.test(String(mobile))) {
      return res.status(400).json({ ok: false, error: 'Sahi mobile number likho (10-15 digits)' });
    }
    try {
      const { rows } = await pool.query(
        `UPDATE users SET name = COALESCE($1, name), mobile = COALESCE($2, mobile),
          trade = $3, experience_years = $4, gulf_experience = $5, passport_status = $6
         WHERE id = $7 RETURNING *`,
        [name ? String(name) : null, mobile ? String(mobile) : null,
          trade === undefined ? req.user.trade : (trade || null),
          experienceYears === undefined || experienceYears === '' ? req.user.experience_years : parseInt(experienceYears, 10),
          gulfExperience === undefined ? req.user.gulf_experience : !!gulfExperience,
          passportStatus === undefined ? req.user.passport_status : (passportStatus || null), req.user.id]);
      res.json({ ok: true, user: publicUser(rows[0]) });
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ ok: false, error: 'Ye mobile number kisi aur account par hai' });
      throw e;
    }
  }));

  // ---------- saved jobs & applications (login required) ----------
  app.get('/api/saved', loadUser, authRequired, asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT j.* FROM jobs j JOIN saved_jobs s ON s.job_id = j.id WHERE s.user_id = $1 ORDER BY s.created_at DESC`,
      [req.user.id]);
    res.json({ ok: true, jobs: rows.map(jobRow) });
  }));
  app.post('/api/jobs/:id/toggle-save', loadUser, authRequired, asyncH(async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    const exists = await pool.query('SELECT 1 FROM saved_jobs WHERE user_id=$1 AND job_id=$2', [req.user.id, jobId]);
    if (exists.rows.length) {
      await pool.query('DELETE FROM saved_jobs WHERE user_id=$1 AND job_id=$2', [req.user.id, jobId]);
      res.json({ ok: true, saved: false });
    } else {
      await pool.query('INSERT INTO saved_jobs (user_id, job_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [req.user.id, jobId]);
      res.json({ ok: true, saved: true });
    }
  }));
  app.post('/api/jobs/:id/apply', loadUser, authRequired, asyncH(async (req, res) => {
    const jobId = parseInt(req.params.id, 10);
    const { rows } = await pool.query(`SELECT * FROM jobs WHERE id=$1 AND status='open'`, [jobId]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Job nahi mila ya band ho gaya' });
    if (!req.user.mobile) {
      return res.status(400).json({ ok: false, error: 'Apply karne se pehle Profile me apna mobile number add karo — Staffora WhatsApp par hi sampark karti hai', needsMobile: true });
    }
    await pool.query(
      `INSERT INTO applications (user_id, job_id) VALUES ($1,$2) ON CONFLICT (user_id, job_id) DO NOTHING`,
      [req.user.id, jobId]);
    res.json({ ok: true, whatsappUrl: whatsappUrl(rows[0], req.user) });
  }));
  app.get('/api/applications/mine', loadUser, authRequired, asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.id, a.status, a.created_at, j.id AS job_id, j.title, j.company, j.country
       FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE a.user_id = $1 ORDER BY a.created_at DESC`, [req.user.id]);
    res.json({ ok: true, applications: rows });
  }));

  // ---------- admin ----------
  app.post('/api/admin/jobs', loadUser, authRequired, adminRequired, asyncH(async (req, res) => {
    const b = req.body || {};
    if (!b.title || String(b.title).length < 3 || !b.company || !b.country || !b.trade) {
      return res.status(400).json({ ok: false, error: 'Title, company, country aur trade zaroori hain' });
    }
    const { rows } = await pool.query(
      `INSERT INTO jobs (title, company, country, city, trade, salary_min, salary_max, salary_currency,
        salary_period, vacancies, benefits, description, duty_info, requirements, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open') RETURNING *`,
      [b.title, b.company, b.country, b.city || null, b.trade,
        b.salaryMin ? parseInt(b.salaryMin, 10) : null, b.salaryMax ? parseInt(b.salaryMax, 10) : null,
        b.salaryCurrency || 'AED', b.salaryPeriod || 'month',
        b.vacancies ? parseInt(b.vacancies, 10) : null, b.benefits || null, b.description || null,
        b.dutyInfo || null, b.requirements || null]);
    res.json({ ok: true, job: jobRow(rows[0]) });
  }));
  app.put('/api/admin/jobs/:id', loadUser, authRequired, adminRequired, asyncH(async (req, res) => {
    const b = req.body || {};
    const cur = await pool.query('SELECT * FROM jobs WHERE id=$1', [req.params.id]);
    if (!cur.rows[0]) return res.status(404).json({ ok: false, error: 'Job nahi mila' });
    const c = cur.rows[0];
    const { rows } = await pool.query(
      `UPDATE jobs SET title=$1, company=$2, country=$3, city=$4, trade=$5,
        salary_min=$6, salary_max=$7, salary_currency=$8, vacancies=$9, benefits=$10,
        description=$11, duty_info=$12, requirements=$13, status=$14 WHERE id=$15 RETURNING *`,
      [b.title || c.title, b.company || c.company, b.country || c.country,
        b.city === undefined ? c.city : (b.city || null), b.trade || c.trade,
        b.salaryMin === undefined ? c.salary_min : (b.salaryMin ? parseInt(b.salaryMin, 10) : null),
        b.salaryMax === undefined ? c.salary_max : (b.salaryMax ? parseInt(b.salaryMax, 10) : null),
        b.salaryCurrency || c.salary_currency,
        b.vacancies === undefined ? c.vacancies : (b.vacancies ? parseInt(b.vacancies, 10) : null),
        b.benefits === undefined ? c.benefits : (b.benefits || null),
        b.description === undefined ? c.description : (b.description || null),
        b.dutyInfo === undefined ? c.duty_info : (b.dutyInfo || null),
        b.requirements === undefined ? c.requirements : (b.requirements || null),
        b.status || c.status, req.params.id]);
    res.json({ ok: true, job: jobRow(rows[0]) });
  }));
  app.get('/api/admin/applications', loadUser, authRequired, adminRequired, asyncH(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT a.id, a.status, a.created_at, u.name AS candidate_name, u.mobile AS candidate_mobile,
         u.trade AS candidate_trade, j.id AS job_id, j.title, j.company
       FROM applications a JOIN users u ON u.id = a.user_id JOIN jobs j ON j.id = a.job_id
       ORDER BY a.created_at DESC LIMIT 500`);
    res.json({ ok: true, applications: rows });
  }));
  app.put('/api/admin/applications/:id', loadUser, authRequired, adminRequired, asyncH(async (req, res) => {
    const status = (req.body || {}).status;
    if (!['applied', 'shortlisted', 'selected', 'rejected'].includes(status)) {
      return res.status(400).json({ ok: false, error: 'Status: applied, shortlisted, selected ya rejected' });
    }
    const { rows } = await pool.query(
      'UPDATE applications SET status=$1 WHERE id=$2 RETURNING id, status', [status, req.params.id]);
    if (!rows[0]) return res.status(404).json({ ok: false, error: 'Application nahi mili' });
    res.json({ ok: true, application: rows[0] });
  }));
  app.post('/api/admin/google-client-id', loadUser, authRequired, adminRequired, asyncH(async (req, res) => {
    const clientId = String((req.body || {}).clientId || '').trim();
    if (clientId && !/^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(clientId)) {
      return res.status(400).json({ ok: false, error: "Ye sahi Google Client ID nahi lagta — ye '.apps.googleusercontent.com' par khatam hota hai" });
    }
    if (!clientId) {
      await pool.query(`DELETE FROM settings WHERE key='google_client_id'`);
    } else {
      await pool.query(
        `INSERT INTO settings (key, value) VALUES ('google_client_id', $1)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [clientId]);
    }
    res.json({ ok: true, googleClientId: clientId || null });
  }));

  // ---------- SPA fallback ----------
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'Not found' });
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
}

async function start() {
  await initDb();
  app.use(session({
    store: sessionStore, // Postgres-backed on Render; in-memory only in local test mode
    secret: SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: IS_PROD, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
  }));
  registerRoutes();
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Server error — dobara try karo' });
  });
  await pool.query(SCHEMA);
  await seed();
  // Only listen when run directly (node server.js). On Vercel the
  // serverless wrapper in api/index.js calls start() without listening.
  if (require.main === module) {
    app.listen(PORT, () => console.log(`Staffora Jobs running on http://localhost:${PORT}`));
  }
}

module.exports = { app, start };
if (require.main === module) start().catch((e) => { console.error(e); process.exit(1); });
