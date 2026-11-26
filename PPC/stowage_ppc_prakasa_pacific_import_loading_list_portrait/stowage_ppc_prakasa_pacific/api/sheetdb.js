const ALLOWED_SHEETS = new Set(['CONTAINER_DATABASE', 'STOWAGE_POSITIONS']);
const ALLOWED_METHODS = new Set(['GET', 'POST']);
const MAX_ROWS_PER_UPLOAD = 2000;

if (!process.env.SHEETDB_API_URL && typeof process.loadEnvFile === 'function') {
  try {
    process.loadEnvFile('.env');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

function respond(res, status, message) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify({ error: message }));
}

module.exports = async function handler(req, res) {
  const method = String(req.method || '').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    res.setHeader('Allow', [...ALLOWED_METHODS].join(', '));
    return respond(res, 405, 'Method not allowed.');
  }

  const requestUrl = new URL(req.url || '/', 'http://localhost');
  const sheet = requestUrl.searchParams.get('sheet');
  if (!ALLOWED_SHEETS.has(sheet)) {
    return respond(res, 400, 'Sheet is not allowed.');
  }

  const origin = req.headers.origin;
  const requestHost = req.headers.host;
  if (origin && requestHost) {
    let originHost;
    try {
      originHost = new URL(origin).host;
    } catch {
      return respond(res, 403, 'Origin is not allowed.');
    }
    if (originHost !== requestHost) {
      return respond(res, 403, 'Origin is not allowed.');
    }
  }

  let endpoint;
  try {
    endpoint = new URL(process.env.SHEETDB_API_URL);
  } catch {
    return respond(res, 500, 'SHEETDB_API_URL is missing or invalid.');
  }
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'sheetdb.io' ||
      !endpoint.pathname.startsWith('/api/v1/')) {
    return respond(res, 500, 'SHEETDB_API_URL must be a SheetDB API URL.');
  }

  let body;
  if (method === 'POST') {
    if (!req.body || typeof req.body !== 'object' || !Array.isArray(req.body.data) ||
        req.body.data.length === 0 || req.body.data.length > MAX_ROWS_PER_UPLOAD) {
      return respond(res, 400, `POST data must contain 1-${MAX_ROWS_PER_UPLOAD} rows.`);
    }
    body = JSON.stringify(req.body);
  }

  endpoint.search = '';
  endpoint.searchParams.set('sheet', sheet);

  try {
    const upstream = await fetch(endpoint, {
      method,
      headers: method === 'POST'
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      body
    });
    const responseBody = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(responseBody);
  } catch (error) {
    console.error('SheetDB proxy request failed:', error);
    respond(res, 502, 'SheetDB request failed.');
  }
};
