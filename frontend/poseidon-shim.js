// Browser shim for @railgun-community/poseidon-hash-wasm.
// Uses pkg-esm + inlined wasm bytes.

import * as pkg from '../node_modules/@railgun-community/poseidon-hash-wasm/pkg-esm/poseidon_hash_wasm.js';
import wasmBytes from '../node_modules/@railgun-community/poseidon-hash-wasm/pkg-esm/poseidon_hash_wasm_bg.wasm';

pkg.initSync(wasmBytes);

const SCALAR_FIELD = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

export function poseidon(inputs) {
  const hexInputs = inputs.map((input) => {
    if (input > SCALAR_FIELD) {
      return (input % SCALAR_FIELD).toString(16);
    } else {
      return input.toString(16);
    }
  });
  const hexOutput = pkg.poseidon(hexInputs);
  return BigInt('0x' + hexOutput);
}

export const poseidonHex = pkg.poseidon;
export default function () { return Promise.resolve(); }
export const initSync = () => {};
export const __esModule = true;
