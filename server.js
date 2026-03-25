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

// ── Proxy route: all football-data requests go through here ──────────────────
app.get('/api/fd/*', async (req, res) => {
  const fdPath = req.params[0];
  const query  = new URLSearchParams(req.query).toString();
  const url    = `${FD_BASE}/${fdPath}${query ? '?' + query : ''}`;

  console.log(`→ FD API: ${url}`);

  try {
    const response = await fetch(url, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY }
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: data.message || 'Football-Data API error',
        status: response.status
      });
    }

    res.json(data);
  } catch (err) {
    console.error('Fetch error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/api/ping', (_, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ BetBuddy server running at http://localhost:${PORT}`);
  console.log(`   Open http://localhost:${PORT}/index.html in your browser\n`);
});
