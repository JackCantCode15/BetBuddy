// BetBuddy — Local API Server
// Run: node server.js
// Requires: npm install express node-fetch cors

const express  = require('express');
const fetch    = (...a) => import('node-fetch').then(({default: f}) => f(...a));
const cors     = require('cors');
const path     = require('path');

const app  = express();
const PORT = 3000;

const FOOTBALL_API_KEY = '8e6b7ca6bf4f47ee979d42a84dd72adf';
const FD_BASE          = 'https://api.football-data.org/v4';

// Allow requests from the local HTML file
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve the frontend
app.use(express.static(path.join(__dirname)));

// ── Cache ─────────────────────────────────────────────────────────────────────
// football-data's free plan allows 10 requests/minute and one EPL page load needs
// ~17, so responses are kept in memory. If the upstream API fails or rate-limits
// us, the last good copy is served instead (even if it's past its TTL).
const MIN   = 60 * 1000;
const cache = new Map();   // url → { data, time }
const inflight = new Map(); // url → Promise, so identical concurrent requests share one fetch

function ttlFor(url) {
  if (url.includes('/teams/')) return 30 * MIN;  // team form / schedules change slowly
  return 5 * MIN;                                // fixtures, scoreboards, odds
}

async function cachedFetch(url, headers, label) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < ttlFor(url)) {
    console.log(`✓ cache ${label}: ${url}`);
    return { status: 200, data: hit.data };
  }
  if (inflight.has(url)) return inflight.get(url);

  const p = (async () => {
    console.log(`→ ${label} API: ${url}`);
    try {
      const response = await fetch(url, { headers });
      const data     = await response.json();
      if (response.ok) {
        cache.set(url, { data, time: Date.now() });
        return { status: 200, data };
      }
      if (hit) {
        console.log(`  ${response.status} from ${label} — serving stale copy`);
        return { status: 200, data: hit.data };
      }
      return { status: response.status, data: { error: data.message || `${label} API error`, status: response.status } };
    } catch (err) {
      console.error(`Fetch error (${label}):`, err.message);
      if (hit) return { status: 200, data: hit.data };
      return { status: 500, data: { error: err.message } };
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

function proxy(base, headers, label) {
  return async (req, res) => {
    const query = new URLSearchParams(req.query).toString();
    const url   = `${base}/${req.params[0]}${query ? '?' + query : ''}`;
    const { status, data } = await cachedFetch(url, headers, label);
    res.status(status).json(data);
  };
}

// ── Proxy route: all football-data requests go through here ──────────────────
app.get('/api/fd/*', proxy(FD_BASE, { 'X-Auth-Token': FOOTBALL_API_KEY }, 'FD'));

// ── Proxy route: ESPN public API (college football — no key needed) ──────────
// e.g. /api/espn/football/college-football/scoreboard
const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';

// ESPN returns an HTML error page to the default node-fetch user agent
app.get('/api/espn/*', proxy(ESPN_BASE, { 'User-Agent': 'Mozilla/5.0 (BetBuddy)', 'Accept': 'application/json' }, 'ESPN'));

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/ping', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ BetBuddy server running at http://localhost:${PORT}`);
  console.log(`   Open http://localhost:${PORT}/index.html in your browser\n`);
});
