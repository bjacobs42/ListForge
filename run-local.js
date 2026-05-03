'use strict';

const fs = require('fs');
const path = require('path');

// Load .env from project root
const envPath = path.join(__dirname, '.env');
if (!fs.existsSync(envPath)) {
  console.error('No .env file found. Create one at:', envPath);
  process.exit(1);
}

fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const eq = trimmed.indexOf('=');
  if (eq === -1) return;
  const key = trimmed.substring(0, eq).trim();
  const val = trimmed.substring(eq + 1).trim().replace(/^"([\s\S]*)"$/, '$1');
  if (key && !(key in process.env)) process.env[key] = val;
});

const pipeline = require('./src/pipeline/productPipeline');

pipeline.run()
  .then(result => {
    console.log('\n── Result ──────────────────────────────');
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.failed > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('\n── Fatal ───────────────────────────────');
    console.error(err);
    process.exit(1);
  });
