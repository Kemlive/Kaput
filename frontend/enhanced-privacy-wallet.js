// Enhanced Privacy Wallet - Connected to Private Node
class EnhancedPrivacyWallet {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this.connectionMode = 'initializing';
    }
    
    async init() {
        // Get provider from config
        this.provider = await KAPUT_NODE_CONFIG.getProvider();
        
        // Check if connected to private node or fallback
        if (this.provider.connection?.url?.includes('.onion')) {
            this.connectionMode = 'private';
        } else {
            this.connectionMode = 'fallback';
        }
        
        console.log(`Connection mode: ${this.connectionMode}`);
        return this.provider;
    }
    
    async createWallet() {
        await this.init();
        
        const wallet = ethers.Wallet.createRandom();
        this.wallet = wallet.connect(this.provider);
        
        return {
            address: wallet.address,
            seedPhrase: wallet.mnemonic.phrase,
            privateKey: wallet.privateKey
        };
    }
}

const enhancedWallet = new EnhancedPrivacyWallet();
console.log('🕵️ Enhanced wallet ready');
console.log('Connecting to private node...');
