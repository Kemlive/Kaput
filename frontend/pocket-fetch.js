// Pocket Network gateway workaround:
// 1. Adds required Content-Type/Accept headers
// 2. Rewrites eth_call requests that use from:0x0 (blocked by Pocket) to use a valid from address
export function pocketFetch(url, options = {}) {
  if (options.body) {
    try {
      const parsed = JSON.parse(options.body);

      // Fix eth_call requests with zero-address from
      if (parsed.method === 'eth_call' && parsed.params?.[0]) {
        const call = parsed.params[0];

        // Pocket rejects from:0x0 — replace with the target contract address
        if (call.from === '0x0000000000000000000000000000000000000000') {
          call.from = call.to || '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';
        }

        // Pocket rejects gasPrice:0x0 — remove it
        if (call.gasPrice === '0x0') {
          delete call.gasPrice;
        }
      }

      options = { ...options, body: JSON.stringify(parsed) };
    } catch (e) {
      // Not JSON — pass through
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    ...(options.headers || {}),
  };

  return fetch(url, { ...options, headers });
}
