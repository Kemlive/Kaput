const KAPUT_NODE = {
    onion: 'ahwce2dustnxi24pqpkej7ms7qis66flg53wpiapvus27lbjeezsdyyd.onion',
    port: 8545,
    proxy: 'socks5://127.0.0.1:9050',
    getProvider() {
        return new ethers.providers.JsonRpcProvider({
            url: 'http://' + this.onion + ':' + this.port,
            proxy: this.proxy
        });
    }
};
