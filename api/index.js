// Vercel serverless entry point — wraps the Express app in server.js.
// No `app.listen` here: server.js only listens when run directly
// (require.main === module), so on Vercel `start()` just inits the DB,
// registers routes, creates tables and seeds jobs once per container.
// jobs.json is required here so Vercel's file tracer includes it in the
// function bundle (seed() reads it from disk on first boot).
'use strict';
void require('../jobs.json');
const { app, start } = require('../server');

let ready = null;
module.exports = async (req, res) => {
  if (!ready) {
    ready = start().catch((err) => {
      ready = null;
      throw err;
    });
  }
  await ready;
  app(req, res);
};
