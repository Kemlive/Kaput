// lethewallet.com RPC proxy
// Forwards JSON-RPC requests through system Tor (127.0.0.1:9050)
// to a public Ethereum RPC. Hides the user's IP from the upstream node.

import http from 'node:http';
import https from 'node:https';
import { SocksProxyAgent } from 'socks-proxy-agent';

const LISTEN_HOST = '127.0.0.1';
const LISTEN_PORT = 8545;
const TOR_PROXY   = 'socks5h://127.0.0.1:9050';
const UPSTREAM    = 'https://ethereum-rpc.publicnode.com';
const ALLOWED_ORIGIN = 'https://lethewallet.com';

const agent = new SocksProxyAgent(TOR_PROXY);
const upstreamUrl = new URL(UPSTREAM);

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const server = http.createServer((req, res) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders);
    return res.end();
  }

  // Only POST allowed (JSON-RPC)
  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders);
    return res.end('Method Not Allowed');
  }

  let body = '';
  req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
  req.on('end', () => {
    const opts = {
      hostname: upstreamUrl.hostname,
      port: 443,
      path: upstreamUrl.pathname + upstreamUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent': 'lethewallet-rpc/1.0',
        'Accept': 'application/json',
      },
      agent,
    };

    const upstream = https.request(opts, (upRes) => {
      res.writeHead(upRes.statusCode || 200, {
        ...corsHeaders,
        'Content-Type': upRes.headers['content-type'] || 'application/json',
      });
      upRes.pipe(res);
    });

    upstream.on('error', (err) => {
      console.error('[RPC] upstream error:', err.message);
      if (!res.headersSent) {
        res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: 'upstream_unavailable', detail: err.message }));
    });

    upstream.write(body);
    upstream.end();
  });
});

// No request logging — privacy first
server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[RPC] listening on ${LISTEN_HOST}:${LISTEN_PORT} → Tor → ${UPSTREAM}`);
  console.log(`[RPC] no request logging; IP addresses never persisted`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
