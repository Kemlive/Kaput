// Kaput RPC Configuration - Your Private Node
const KAPUT_NODE_CONFIG = {
    // Your private node via Tor
    onion: 'ahwce2dustnxi24pqpkej7ms7qis66flg53wpiapvus27lbjeezsdyyd.onion',
    port: 8545,
    
    // Fallback public RPCs (if Tor not available)
    fallbackRPCs: [
        'https://eth.llamarpc.com',
        'https://ethereum.publicnode.com',
        'https://1rpc.io/eth'
    ],
    
    // Get provider based on availability
    async getProvider() {
        // Try Tor first
        try {
            const provider = new ethers.providers.JsonRpcProvider({
                url: `http://${this.onion}:${this.port}`,
                proxy: 'socks5://127.0.0.1:9050',
                timeout: 5000
            });
            
            // Test connection
            await provider.getBlockNumber();
            console.log('✅ Connected via Tor to private node');
            return provider;
        } catch (torError) {
            console.log('⚠️ Tor not available, using fallback RPC');
            
            // Use random fallback
            const randomRPC = this.fallbackRPCs[Math.floor(Math.random() * this.fallbackRPCs.length)];
            const provider = new ethers.providers.JsonRpcProvider(randomRPC);
            await provider.getBlockNumber();
            console.log('✅ Connected to fallback RPC');
            return provider;
        }
    }
};
