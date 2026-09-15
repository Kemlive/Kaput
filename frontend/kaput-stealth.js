import './buffer-shim.js';
import './buffer-shim.js';
import { pocketFetch } from './pocket-fetch.js';
// Kaput Stealth Module — ERC-5564 compatible
import {
  generateKeysFromSignature,
  extractViewingPrivateKeyNode,
  generateEphemeralPrivateKey,
  generateStealthPrivateKey,
  generateStealthAddresses,
  predictStealthSafeAddressWithClient,
  generateFluidkeyMessage,
} from '@fluidkey/stealth-account-kit';
import { privateKeyToAccount } from 'viem/accounts';
import * as secp from '@noble/secp256k1';
import { http, toHex, createPublicClient } from 'viem';
import { mainnet, arbitrum } from 'viem/chains';

// Custom transport that rewrites eth_call body to work around Pocket 405
import { http as viemHttp } from 'viem';
import { torFetch } from './tor-fetch.js';

const originalFetch = window.fetch;
window.fetch = async function(resource, options) {
    if (options && options.body && typeof options.body === 'string') {
        try {
            const body = JSON.parse(options.body);
            if (body.method === 'eth_call' && body.params && body.params[0]) {
                const call = body.params[0];
                if (call.from === '0x0000000000000000000000000000000000000000') {
                    call.from = call.to || '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';
                    delete call.gasPrice;
                    options.body = JSON.stringify(body);

                    const urlStr = typeof resource === 'string' ? resource : (resource && resource.url ? resource.url : '');
                    if (urlStr.includes('llamarpc') || urlStr.includes('pocket') || urlStr.includes('eth.')) {
                        return torFetch('https://ethereum-rpc.publicnode.com', options);
                    }
                }
            }
        } catch(e) {
            // Ignore non-JSON bodies
        }
    }
    return originalFetch(resource, options);
};


// Global fetch override to bypass RPC rejections for Safe prediction eth_calls



// Dedicated client for Safe prediction to bypass Pocket's 405 block
const safePredictionClient = createPublicClient({
  chain: mainnet,
  transport: http('https://ethereum-rpc.publicnode.com', { fetchFn: torFetch })
});


function pocketTransport(rpcUrl) {
  const inner = viemHttp(rpcUrl);
  return (config) => {
    const transport = inner(config);
    const originalRequest = transport.request;
    return {
      ...transport,
      async request(args) {
        // Rewrite the body if it's an eth_call with from:0x0
        if (args?.method === 'eth_call' && args?.params?.[0]) {
          const call = args.params[0];
          if (call.from === '0x0000000000000000000000000000000000000000') {
            call.from = call.to || '0xa6B71E26C5e0845f74c812102Ca7114b6a896AB2';
          }
          if (call.gasPrice === '0x0') {
            delete call.gasPrice;
          }
          console.log('[POCKET TRANSPORT] Rewrote eth_call:', JSON.stringify(call).slice(0, 100));
        }
        return originalRequest(args);
      },
    };
  };
}


const SAFE_VERSION = '1.3.0';
const USE_DEFAULT_ADDRESS = true;
const THRESHOLD = 1;

const CHAIN_MAP = {
  ethereum: { id: 1, viemChain: mainnet, rpc: 'https://eth.api.pocket.network' },
  arbitrum: { id: 42161, viemChain: arbitrum, rpc: 'https://arb-one.api.pocket.network' },
};

let userKeys = null;
let viewingKeyNode = null;
let spendingPublicKey = null;
let viewingPublicKey = null;
let generatedAccounts = [];

// Convert a hex private key → compressed public key (33 bytes, 0x02/0x03 prefix)
function privateKeyToCompressedPubKey(privKey) {
  const priv = privKey.startsWith('0x') ? privKey.slice(2) : privKey;
  const pub = secp.getPublicKey(priv, true); // true = compressed
  return toHex(pub);
}

export async function initStealth(kaputWallet, pin = '0000') {
  const address = await kaputWallet.getAddress();
  const { message } = generateFluidkeyMessage({ pin, address });
  const signature = await kaputWallet.signMessage(message);
  userKeys = generateKeysFromSignature(signature);
  viewingKeyNode = extractViewingPrivateKeyNode(userKeys.viewingPrivateKey);

  // Compressed public keys (ERC-5564 format)
  spendingPublicKey = privateKeyToCompressedPubKey(userKeys.spendingPrivateKey);
  viewingPublicKey = privateKeyToCompressedPubKey(userKeys.viewingPrivateKey);

  return { metaAddress: getMetaAddress() };
}

export function getMetaAddress() {
  if (!spendingPublicKey || !viewingPublicKey) throw new Error('Stealth not initialized');
  // ERC-5564 format: st:eth:<compressedSpendingPub><compressedViewingPub>
  return 'st:eth:' + spendingPublicKey.slice(2) + viewingPublicKey.slice(2);
}

export async function generateNextAddress(chainName = 'ethereum') {
  if (!viewingKeyNode) throw new Error('Stealth not initialized');
  const chain = CHAIN_MAP[chainName];
  if (!chain) throw new Error('Unknown chain: ' + chainName);

  const nonce = BigInt(generatedAccounts.length);

  const { ephemeralPrivateKey } = generateEphemeralPrivateKey({
    viewingPrivateKeyNode: viewingKeyNode,
    nonce,
    chainId: chain.id,
  });

  // Sender-side: generate stealth address from OUR spending pub key
  const { stealthAddresses } = generateStealthAddresses({
    spendingPublicKeys: [spendingPublicKey],
    ephemeralPrivateKey,
  });

  const stealthAddress = stealthAddresses[0];
  const ephemeralAccount = privateKeyToAccount(ephemeralPrivateKey);

  // Predict the Safe
  const { stealthSafeAddress } = await predictStealthSafeAddressWithClient({
    threshold: THRESHOLD,
    stealthAddresses: [stealthAddress],
    chainId: chain.id,
    // Pocket blocks eth_call to Safe Factory — route this call through a public node
    client: safePredictionClient,
    useDefaultAddress: USE_DEFAULT_ADDRESS,
    safeVersion: SAFE_VERSION,
  });

  const { stealthPrivateKey } = generateStealthPrivateKey({
    spendingPrivateKey: userKeys.spendingPrivateKey,
    ephemeralPublicKey: ephemeralAccount.publicKey,
  });

  const account = {
    nonce: Number(nonce),
    stealthAddress,
    stealthSafeAddress,
    stealthPrivateKey,
    chainId: chain.id,
    chainName,
  };

  generatedAccounts.push(account);
  return account;
}

export function getGeneratedAccounts() {
  return generatedAccounts;
}

window.KaputStealth = {
  initStealth,
  getMetaAddress,
  generateNextAddress,
  getGeneratedAccounts,
};
