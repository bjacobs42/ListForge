'use strict';

// Canva token lifecycle:
// - Tokens stored in Config Sheet!A2:C2 [accessToken, refreshToken, expiresAt (ms)]
// - Token refreshed if missing or expiring within 30 minutes
// - Updated token written back to Config Sheet so next invocation reuses it

const https = require('https');
const { readRange, writeRange } = require('../sheets/client');
const cfg = require('../config');
const log = require('../utils/logger');

function canvaRequest(method, path, accessToken, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req  = https.request({
      hostname: 'api.canva.com',
      path: `/rest/v1${path}`,
      method,
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Canva request timed out')); });
    if (data) req.write(data);
    req.end();
  });
}

async function refreshToken(refreshToken) {
  const credentials = Buffer.from(`${cfg.CANVA_CLIENT_ID}:${cfg.CANVA_CLIENT_SECRET}`).toString('base64');
  const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.canva.com',
      path: '/rest/v1/oauth/token',
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          if (!json.access_token) throw new Error(`Canva token refresh failed: ${raw}`);
          resolve({
            accessToken:  json.access_token,
            refreshToken: json.refresh_token || refreshToken,
            expiresAt:    Date.now() + (json.expires_in || 14400) * 1000,
          });
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('Canva token refresh timed out')); });
    req.write(body);
    req.end();
  });
}

async function getAccessToken(gToken) {
  const row = await readRange(gToken, cfg.GOOGLE_SHEET_ID, cfg.CANVA_TOKEN_RANGE);
  const accessToken  = (row[0] || '').trim();
  const storedRefresh = (row[1] || '').trim();
  const expiresAt    = parseInt(row[2] || '0', 10) || 0;

  if (accessToken && expiresAt > Date.now() + 30 * 60 * 1000) {
    return accessToken;
  }

  if (!storedRefresh) throw new Error('Canva refresh token not found in Config Sheet!A2:C2');
  log.info('[canva] Refreshing access token');

  const newTokens = await refreshToken(storedRefresh);
  await writeRange(gToken, cfg.GOOGLE_SHEET_ID, cfg.CANVA_TOKEN_RANGE, [[
    newTokens.accessToken,
    newTokens.refreshToken,
    String(newTokens.expiresAt),
  ]]);
  log.info('[canva] Token refreshed and saved');
  return newTokens.accessToken;
}

function extractDesignId(canvaUrl) {
  const match = canvaUrl.match(/\/design\/([^/]+)\//);
  return match ? match[1] : null;
}

async function createExportJob(designId, accessToken) {
  const res = await canvaRequest('POST', '/exports', accessToken, {
    design_id: designId,
    format: { type: 'png' },
  });
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Canva createExportJob failed (${res.status}): ${JSON.stringify(res.body)}`);
  }
  return res.body.job.id;
}

async function pollExportJob(jobId, accessToken, intervalMs = 2000, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await canvaRequest('GET', `/exports/${jobId}`, accessToken);
    if (res.status !== 200) throw new Error(`Canva poll failed (${res.status})`);
    const job = res.body.job;
    if (job.status === 'success') return job.urls;
    if (job.status === 'failed')  throw new Error(`Canva export failed: ${JSON.stringify(job.error)}`);
    await new Promise(r => setTimeout(r, intervalMs));
  }
  throw new Error(`Canva export job ${jobId} timed out`);
}

async function getImages(canvaUrl, gToken) {
  const designId = extractDesignId(canvaUrl);
  if (!designId) throw new Error(`Cannot extract design ID from Canva URL: ${canvaUrl}`);

  const accessToken = await getAccessToken(gToken);
  const jobId       = await createExportJob(designId, accessToken);
  log.info(`[canva] Export job created: ${jobId}`);

  const urls = await pollExportJob(jobId, accessToken);
  log.info(`[canva] Export complete: ${urls.length} image(s)`);
  return urls;
}

module.exports = { getImages };
