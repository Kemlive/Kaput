# Privacy-First Configuration Guide

## IMPORTANT: Remove All Identity-Linked Services

### NO API Keys
- No Etherscan API key (linked to email)
- No Infura project ID (linked to account)
- No Alchemy API key (linked to account)

### Use Public RPCs Only
- Ethereum: eth.llamarpc.com, ethereum.publicnode.com
- Arbitrum: arb1.arbitrum.io, arbitrum.publicnode.com
- Optimism: mainnet.optimism.io, optimism.publicnode.com
- Polygon: polygon-rpc.com, polygon.publicnode.com

### Use Tor for Maximum Privacy
- Run Tor: tor --SocksPort 9050
- Configure provider with proxy: socks5://127.0.0.1:9050

### What NOT to use
- API keys (track your requests)
- Personal RPC (reveals IP)
- KYC services
- Real identity on GitHub

### What TO use
- Public RPCs (no registration)
- Tor/VPN
- Anonymous accounts
- Local node (most private)
