-- Staffora Jobs — schema (also created automatically by server.js on boot).
-- Run once against your Neon Postgres database if you want to inspect it manually:
--   psql "$DATABASE_URL" -f schema.sql
-- The server creates the same tables itself, so this file is optional.
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
-- Sessions table is created automatically by connect-pg-simple on first run.
