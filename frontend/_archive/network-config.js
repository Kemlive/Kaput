// Multi-Network Configuration
const NETWORKS = {
    ethereum: {
        name: "Ethereum",
        chainId: 1,
        rpc: "https://eth.llamarpc.com",
        symbol: "ETH",
        explorer: "https://etherscan.io"
    },
    arbitrum: {
        name: "Arbitrum",
        chainId: 42161,
        rpc: "https://arb1.arbitrum.io/rpc",
        symbol: "ETH",
        explorer: "https://arbiscan.io"
    },
    optimism: {
        name: "Optimism",
        chainId: 10,
        rpc: "https://mainnet.optimism.io",
        symbol: "ETH",
        explorer: "https://optimistic.etherscan.io"
    },
    base: {
        name: "Base",
        chainId: 8453,
        rpc: "https://mainnet.base.org",
        symbol: "ETH",
        explorer: "https://basescan.org"
    },
    polygon: {
        name: "Polygon",
        chainId: 137,
        rpc: "https://polygon-rpc.com",
        symbol: "MATIC",
        explorer: "https://polygonscan.com"
    },
    bnb: {
        name: "BNB Chain",
        chainId: 56,
        rpc: "https://bsc-dataseed.binance.org",
        symbol: "BNB",
        explorer: "https://bscscan.com"
    },
    avalanche: {
        name: "Avalanche",
        chainId: 43114,
        rpc: "https://api.avax.network/ext/bc/C/rpc",
        symbol: "AVAX",
        explorer: "https://snowtrace.io"
    },
    linea: {
        name: "Linea",
        chainId: 59144,
        rpc: "https://rpc.linea.build",
        symbol: "ETH",
        explorer: "https://lineascan.build"
    },
    zksync: {
        name: "zkSync Era",
        chainId: 324,
        rpc: "https://mainnet.era.zksync.io",
        symbol: "ETH",
        explorer: "https://explorer.zksync.io"
    },
    scroll: {
        name: "Scroll",
        chainId: 534352,
        rpc: "https://rpc.scroll.io",
        symbol: "ETH",
        explorer: "https://scrollscan.com"
    }
};

class NetworkManager {
    constructor() {
        this.currentNetwork = 'ethereum';
        this.providers = {};
    }
    
    getNetworkConfig(networkName) {
        return NETWORKS[networkName] || NETWORKS.ethereum;
    }
    
    async switchNetwork(networkName) {
        this.currentNetwork = networkName;
        const config = this.getNetworkConfig(networkName);
        
        if (!this.providers[networkName]) {
            this.providers[networkName] = new ethers.providers.JsonRpcProvider(config.rpc);
        }
        
        return {
            config: config,
            provider: this.providers[networkName]
        };
    }
    
    getAllNetworks() {
        return Object.keys(NETWORKS).map(key => ({
            key: key,
            ...NETWORKS[key]
        }));
    }
}

// Create network switcher UI
function createNetworkSwitcher() {
    const manager = new NetworkManager();
    const networks = manager.getAllNetworks();
    
    let html = '<select id="networkSelector" onchange="switchNetwork(this.value)">';
    networks.forEach(network => {
        html += `<option value="${network.key}">${network.name}</option>`;
    });
    html += '</select>';
    
    return html;
}

async function switchNetwork(networkName) {
    const manager = new NetworkManager();
    const { config, provider } = await manager.switchNetwork(networkName);
    
    console.log(`Switched to ${config.name}`);
    console.log(`RPC: ${config.rpc}`);
    console.log(`Chain ID: ${config.chainId}`);
    
    // Update wallet provider
    if (typeof kaputWallet !== 'undefined') {
        kaputWallet.provider = provider;
    }
    
    return provider;
}

console.log('Network Manager loaded');
console.log('Available networks:', Object.keys(NETWORKS).length);
