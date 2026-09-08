class SecureWallet {
    constructor() {
        this.encryptionKey = null;
        this.walletData = null;
    }
    
    async createEncryptedWallet(password) {
        const wallet = ethers.Wallet.createRandom();
        
        // Encrypt seed with password
        const encrypted = await this.encryptData(wallet.mnemonic.phrase, password);
        
        // Store ONLY encrypted data
        localStorage.setItem('kaput_encrypted', JSON.stringify(encrypted));
        
        return wallet.address;
    }
    
    async encryptData(data, password) {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey(
            {name: 'PBKDF2', salt: enc.encode('kaput-salt'), iterations: 100000, hash: 'SHA-256'},
            keyMaterial, {name: 'AES-GCM', length: 256}, false, ['encrypt','decrypt']
        );
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, enc.encode(data));
        return {iv: Array.from(iv), data: Array.from(new Uint8Array(encrypted))};
    }
}
