// PostgreSQL is the only runtime database. Do not restore a SQLite database
// or initialize Vercel Blob state before loading the application.
module.exports = require('../server');