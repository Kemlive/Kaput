// Lethe Privacy Pool worker wrapper — installs globals before the SDK loads.
// Static imports below are hoisted, but this file has NO other imports,
// so the globals are set as the first executable statements.

import { Buffer } from 'buffer';
import process from 'process';

// Install globals on every scope name the SDK might check
const g = (typeof globalThis !== 'undefined') ? globalThis
        : (typeof self !== 'undefined') ? self
        : (typeof window !== 'undefined') ? window
        : {};

g.Buffer = Buffer;
g.process = process;
g.global = g;

if (typeof self !== 'undefined' && self !== g) {
  self.Buffer = Buffer;
  self.process = process;
}

console.log('[LETHE POOL WORKER] Globals installed:', {
  hasBuffer: !!g.Buffer,
  hasProcess: !!g.process,
});

// Now load the real worker. By this point, globals exist.
// Rewrite Squid GraphQL calls through our origin so the browser never
// contacts squids.live directly. Preserves privacy + avoids IP rate limits.
const _fetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : (input && input.url) || String(input);
  if (url.startsWith('https://rail-squid.squids.live')) {
    const proxied = url.replace(
      'https://rail-squid.squids.live',
      self.location.origin + '/squid'
    );
    return _fetch(proxied, init);
  }
  return _fetch(input, init);
};

// Diagnostic: forward worker errors + unhandled rejections to the main thread.
self.addEventListener('error', (e) => {
  self.postMessage({ type: 'worker-error', message: e.message, stack: e.error && e.error.stack });
});
self.addEventListener('unhandledrejection', (e) => {
  self.postMessage({ type: 'worker-rejection', reason: String(e.reason && (e.reason.stack || e.reason.message || e.reason)) });
});

await import('./lethe-pool-worker-core.js');
