const KAPUT_NODE_CONFIG = {
    localRPC: 'http://127.0.0.1:8545',
    async getProvider() {
        // ONLY local node. No fallback. No public RPC.
        const provider = new ethers.providers.JsonRpcProvider(this.localRPC);
        await provider.getBlockNumber();
        return provider;
    }
};
