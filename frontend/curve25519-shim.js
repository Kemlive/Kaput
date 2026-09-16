// Browser shim for @railgun-community/curve25519-scalarmult-wasm.
// Uses pkg-esm + inlined wasm bytes.

import * as pkg from '../node_modules/@railgun-community/curve25519-scalarmult-wasm/pkg-esm/curve25519_scalarmult_wasm.js';
import wasmBytes from '../node_modules/@railgun-community/curve25519-scalarmult-wasm/pkg-esm/curve25519_scalarmult_wasm_bg.wasm';

// initSync(bytes) worked for poseidon; assume same signature here.
pkg.initSync(wasmBytes);

export const scalarMultiply = pkg.scalarMultiply;
export default pkg;
