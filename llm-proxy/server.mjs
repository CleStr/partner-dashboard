// LLM-Proxy für Fraunhofer-Infrastruktur (Node.js, deployment-fertig).
//
// Sicherheitsmodell:
// - Der Fraunhofer-API-Token liegt ausschließlich in der Umgebungsvariable
//   FHG_API_KEY auf dem Proxy-Host — nie im Frontend, nie im Git.
// - Egress-Allowlist: der Proxy ruft ausschließlich den konfigurierten
//   Fraunhofer-Endpunkt auf (kein offener Weiterleitungs-Proxy).
// - Kein Logging von Anfrage-Inhalten; nur Metadaten (Zeitpunkt, Status).
// - Rate-Limit pro IP, damit der Token nicht exfiltriert werden kann.
//
// Start: FHG_API_KEY=... node server.mjs
// Env:   PORT (Default 8787), FHG_BASE_URL (Default Fraunhofer-Endpoint),
//        ALLOWED_ORIGIN (CORS, z. B. https://<user>.github.io)

import { createServer } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

const PORT = Number(process.env.PORT ?? 8787);
const FHG_BASE_URL = process.env.FHG_BASE_URL ?? 'https://api.fhgenie.fraunhofer.de/v1';
const FHG_API_KEY = process.env.FHG_API_KEY ?? '';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN ?? '';
const MAX_BODY = 64 * 1024; // 64 KB — nur aggregierte Kennzahlen
const RATE_LIMIT = 30; // Anfragen pro IP pro Minute
const rateMap = new Map();

if (!FHG_API_KEY) {
  console.error('Fehler: FHG_API_KEY ist nicht gesetzt.');
  process.exit(1);
}

function rateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now > entry.reset) {
    rateMap.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT;
}

function send(res, status, body, extra = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
  res.end(body);
}

const server = createServer(async (req, res) => {
  const ip = req.socket.remoteAddress ?? 'unknown';

  if (req.method === 'OPTIONS') {
    send(res, 204, '', { 'Access-Control-Max-Age': '86400' });
    return;
  }

  if (req.url !== '/analyze' || req.method !== 'POST') {
    send(res, 404, JSON.stringify({ error: 'Nicht gefunden.' }));
    return;
  }

  if (ALLOWED_ORIGIN && req.headers.origin !== ALLOWED_ORIGIN) {
    send(res, 403, JSON.stringify({ error: 'Origin nicht erlaubt.' }));
    return;
  }

  if (rateLimited(ip)) {
    send(res, 429, JSON.stringify({ error: 'Zu viele Anfragen.' }));
    return;
  }

  // Body lesen (max. 64 KB)
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) {
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on('end', async () => {
    let payload;
    try {
      payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
    } catch {
      send(res, 400, JSON.stringify({ error: 'Ungültiges JSON.' }));
      return;
    }
    if (!payload.variable || typeof payload.stats !== 'object') {
      send(res, 400, JSON.stringify({ error: 'variable und stats erforderlich.' }));
      return;
    }

    // Prompt nur aus Label + aggregierten Kennzahlen bauen
    const prompt = `Du bist ein Analyst für Innovationsforschung. Interpretiere die folgende aggregierte Statistik einer Umfragevariable und fasse die wichtigsten Erkenntnisse in 3-5 Sätzen auf Deutsch zusammen. Nutze ausschließlich die gelieferten Daten.\n\nVariable: ${payload.variable}\nKennzahlen: ${JSON.stringify(payload.stats)}`;

    try {
      const analysis = await callFhg(payload.model ?? 'default', prompt);
      send(res, 200, JSON.stringify({ analysis }));
    } catch (e) {
      send(res, 502, JSON.stringify({ error: 'FhG-API-Fehler.' }));
    }
  });
});

function callFhg(model, prompt) {
  return new Promise((resolve, reject) => {
    const url = new URL(FHG_BASE_URL.replace(/\/$/, '') + '/chat/completions');
    const isHttps = url.protocol === 'https:';
    const doRequest = isHttps ? httpsRequest : httpRequest;
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${FHG_API_KEY}`,
        'Content-Length': Buffer.byteLength(JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] })),
      },
    };
    const upstream = doRequest(options, (up) => {
      let data = '';
      up.on('data', (d) => (data += d.toString()));
      up.on('end', () => {
        if (up.statusCode !== 200) {
          reject(new Error(`Upstream ${up.statusCode}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          resolve(json.choices?.[0]?.message?.content ?? '');
        } catch {
          reject(new Error('Ungültige Upstream-Antwort.'));
        }
      });
    });
    upstream.on('error', reject);
    upstream.end(JSON.stringify({ model, messages: [{ role: 'user', content: prompt }] }));
  });
}

server.listen(PORT, () => {
  console.log(`LLM-Proxy lauscht auf :${PORT}. Egress nur zu ${FHG_BASE_URL}`);
});
