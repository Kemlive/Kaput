// Wrapper that installs globals BEFORE the SDK loads.
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

console.log('[WORKER WRAPPER] Globals installed:', {
  hasBuffer: !!g.Buffer,
  hasProcess: !!g.process,
});

// Now load the real worker. By this point, globals exist.
await import('./railgun-worker-core.js');
