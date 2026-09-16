// Railgun Worker — Stage 0 boot test
// Proves the SDK can be imported in a Web Worker.
// Does NOT start the engine, no storage, no RPC.

import * as Railgun from '@railgun-community/wallet';

self.onmessage = (event) => {
  const { type, id } = event.data || {};
  if (type === 'ping') {
    self.postMessage({
      type: 'pong',
      id: id ?? null,
      sdk: {
        hasStartEngine: typeof Railgun.startRailgunEngine === 'function',
        hasCreateWallet: typeof Railgun.createRailgunWallet === 'function',
        hasProver: typeof Railgun.getProver === 'function',
        hasArtifactStore: typeof Railgun.createArtifactStore === 'function',
        hasLoadProvider: typeof Railgun.loadProvider === 'function',
        exportCount: Object.keys(Railgun).length,
      },
    });
  }
};

// Announce ready as soon as the module finishes evaluating
self.postMessage({
  type: 'ready',
  exportSample: Object.keys(Railgun).slice(0, 30),
});
