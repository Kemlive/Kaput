import { Buffer } from 'buffer';
import process from 'process';

if (typeof window !== 'undefined') {
  if (!window.Buffer) window.Buffer = Buffer;
  if (!window.process) window.process = process;
  if (!window.global) window.global = window;
}
if (typeof globalThis !== 'undefined') {
  if (!globalThis.Buffer) globalThis.Buffer = Buffer;
  if (!globalThis.process) globalThis.process = process;
  if (!globalThis.global) globalThis.global = globalThis;
}
export { Buffer };
