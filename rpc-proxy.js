// Lethe RPC proxy: forwards JSON-RPC POSTs through system Tor.
// Chain via X-Chain header OR ?chain= query string.

import http from 'node:http';
import https from 'node:https';
import { SocksProxyAgent } from 'socks-proxy-agent';

const LISTEN_HOST = '127.0.0.1';
const LISTEN_PORT = 8545;
const TOR_PROXY   = 'socks5h://127.0.0.1:9050';
const ALLOWED_ORIGIN = 'https://lethewallet.com';

const UPSTREAM_MAP = {
  ethereum: 'https://ethereum-rpc.publicnode.com',
  arbitrum: 'https://arb1.arbitrum.io/rpc',   // official RPC, no token, full history
  sepolia:  'https://ethereum-sepolia-rpc.publicnode.com',
};

const agent = new SocksProxyAgent(TOR_PROXY);

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Chain',
  'Access-Control-Max-Age': '86400',
};

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders); return res.end(); }
  if (req.method !== 'POST') { res.writeHead(405, corsHeaders); return res.end('Method Not Allowed'); }

  const urlObj = new URL(req.url, 'http://localhost');
  const chainFromQuery = urlObj.searchParams.get('chain');
  const chainFromHeader = req.headers['x-chain'];
  const chainKey = String(chainFromHeader || chainFromQuery || 'ethereum').toLowerCase();
  const upstreamUrl = new URL(UPSTREAM_MAP[chainKey] || UPSTREAM_MAP.ethereum);

  let body = '';
  req.on('data', c => { body += c; if (body.length > 1e6) req.destroy(); });
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
      console.error('[RPC] upstream error:', err.message, 'chain:', chainKey);
      if (!res.headersSent) res.writeHead(502, { ...corsHeaders, 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream_unavailable', detail: err.message }));
    });
    upstream.write(body);
    upstream.end();
  });
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  console.log(`[RPC] listening on ${LISTEN_HOST}:${LISTEN_PORT} → Tor`);
  console.log(`[RPC] upstreams:`, UPSTREAM_MAP);
  console.log(`[RPC] chain selection: X-Chain header OR ?chain= query`);
  console.log(`[RPC] no request logging`);
});

process.on('SIGTERM', () => { server.close(() => process.exit(0)); });
