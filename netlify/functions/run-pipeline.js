'use strict';

const pipeline = require('../../src/pipeline/productPipeline');

exports.handler = async function(event) {
  const headers = { 'Content-Type': 'application/json' };

  // Validate optional TRIGGER_SECRET for manual POST triggers
  const secret = process.env.TRIGGER_SECRET;
  if (secret && event.httpMethod === 'POST') {
    const provided = event.headers['x-trigger-secret'] || event.headers['X-Trigger-Secret'];
    if (provided !== secret) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };
    }
  }

  try {
    const summary = await pipeline.run();
    return { statusCode: 200, headers, body: JSON.stringify(summary) };
  } catch (err) {
    console.error('[run-pipeline] Fatal error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
