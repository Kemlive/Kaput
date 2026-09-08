# Privacy-First Configuration Guide

## IMPORTANT: Remove All Identity-Linked Services

### 1. NO Etherscan API Key
- Etherscan API keys are linked to your email
- They can track your verification requests
- Use anonymous block explorers instead

### 2. NO Infura/Alchemy API Keys
- These services track your IP
- They log your requests
- Use public RPCs instead

### 3. NO Personal RPC Endpoints
- Your RPC endpoint reveals your IP
- Use rotating public RPCs
- Or run your own node via Tor

## Privacy-First RPC Configuration:

### Public RPCs (No API Key Needed):
```javascript
const PRIVATE_RPCS = {
    ethereum: [
        'https://eth.llamarpc.com',
        'https://ethereum.publicnode.com',
        'https://1rpc.io/eth',
        'https://rpc.mevblocker.io'
    ],
    arbitrum: [
        'https://arb1.arbitrum.io/rpc',
        'https://arbitrum.publicnode.com',
        'https://1rpc.io/arb'
    ],
    optimism: [
        'https://mainnet.optimism.io',
        'https://optimism.publicnode.com',
        'https://1rpc.io/op'
    ],
    polygon: [
        'https://polygon-rpc.com',
        'https://polygon.publicnode.com',
        'https://1rpc.io/matic'
    ]
};
# Run Tor
tor --SocksPort 9050

# Configure wallet to use Tor
const provider = new ethers.providers.JsonRpcProvider({
    url: rpcUrl,
    proxy: 'socks5://127.0.0.1:9050'
});
