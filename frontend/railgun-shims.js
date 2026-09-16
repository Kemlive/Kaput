// Injected by esbuild — every free `Buffer`, `process`, `TextEncoder`, `TextDecoder`
// reference in the bundle resolves through this file.
import { Buffer } from 'buffer';
import process from 'process';

// Native browser TextEncoder/TextDecoder — the `util` polyfill doesn't ship them
const NativeTextEncoder = (typeof globalThis !== 'undefined' && globalThis.TextEncoder)
  || (typeof self !== 'undefined' && self.TextEncoder);
const NativeTextDecoder = (typeof globalThis !== 'undefined' && globalThis.TextDecoder)
  || (typeof self !== 'undefined' && self.TextDecoder);

const TextEncoderShim = NativeTextEncoder;
const TextDecoderShim = NativeTextDecoder;

// Attach to every possible global scope
const g = (typeof globalThis !== 'undefined') ? globalThis
        : (typeof self !== 'undefined') ? self
        : (typeof window !== 'undefined') ? window
        : {};

if (g) {
  if (!g.Buffer) g.Buffer = Buffer;
  if (!g.process) g.process = process;
  if (!g.global) g.global = g;
  if (!g.TextEncoder) g.TextEncoder = TextEncoderShim;
  if (!g.TextDecoder) g.TextDecoder = TextDecoderShim;
}

export {
  Buffer,
  process,
  TextEncoderShim as TextEncoder,
  TextDecoderShim as TextDecoder,
};
