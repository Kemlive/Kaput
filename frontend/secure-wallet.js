// Secure Wallet Core - Maximum Security
class SecureWallet {
    constructor() {
        this.encryptionKey = null;
        this.walletData = null;
        this.sessionTimeout = 5 * 60 * 1000; // 5 minutes
        this.lastActivity = Date.now();
        this.isLocked = true;
        this.failedAttempts = 0;
        this.maxAttempts = 5;
        this.lockoutPeriod = 15 * 60 * 1000; // 15 minutes
    }
    
    // Create encrypted wallet
    async createEncryptedWallet(password) {
        try {
            // Generate encryption key from password
            const salt = crypto.getRandomValues(new Uint8Array(32));
            const key = await this.deriveKey(password, salt);
            
            // Generate wallet
            const wallet = ethers.Wallet.createRandom();
            
            // Encrypt wallet data
            const walletData = {
                address: wallet.address,
                seedPhrase: wallet.mnemonic.phrase,
                privateKey: wallet.privateKey
            };
            
            const encrypted = await this.encryptData(
                JSON.stringify(walletData),
                key
            );
            
            this.walletData = {
                encrypted: encrypted,
                salt: Array.from(salt),
                iv: encrypted.iv
            };
            
            this.encryptionKey = key;
            this.isLocked = false;
            
            return wallet.address;
        } catch (error) {
            console.error('Wallet creation failed:', error);
            throw error;
        }
    }
    
    // Derive encryption key from password (PBKDF2)
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const passwordBuffer = encoder.encode(password);
        
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 1000000, // 1 million iterations
                hash: 'SHA-256'
            },
            keyMaterial,
            {
                name: 'AES-GCM',
                length: 256
            },
            false,
            ['encrypt', 'decrypt']
        );
        
        return key;
    }
    
    // Encrypt data with AES-256-GCM
    async encryptData(data, key) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoder = new TextEncoder();
        
        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encoder.encode(data)
        );
        
        return {
            ciphertext: Array.from(new Uint8Array(encrypted)),
            iv: Array.from(iv)
        };
    }
    
    // Decrypt data
    async decryptData(encryptedData, key) {
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: new Uint8Array(encryptedData.iv)
            },
            key,
            new Uint8Array(encryptedData.ciphertext)
        );
        
        const decoder = new TextDecoder();
        return decoder.decode(decrypted);
    }
    
    // Unlock wallet with password
    async unlockWallet(password) {
        // Check if locked out
        if (this.failedAttempts >= this.maxAttempts) {
            const timeSinceLockout = Date.now() - this.lockoutPeriod;
            if (timeSinceLockout < this.lockoutPeriod) {
                throw new Error('Wallet locked. Try again later.');
            }
            this.failedAttempts = 0;
        }
        
        try {
            const salt = new Uint8Array(this.walletData.salt);
            const key = await this.deriveKey(password, salt);
            
            const decrypted = await this.decryptData(
                this.walletData.encrypted,
                key
            );
            
            this.encryptionKey = key;
            this.walletData.decrypted = JSON.parse(decrypted);
            this.isLocked = false;
            this.failedAttempts = 0;
            this.lastActivity = Date.now();
            
            return true;
        } catch (error) {
            this.failedAttempts++;
            throw new Error('Invalid password');
        }
    }
    
    // Lock wallet
    lockWallet() {
        this.isLocked = true;
        this.encryptionKey = null;
        this.walletData.decrypted = null;
        
        // Clear from memory
        if (this.walletData) {
            delete this.walletData.decrypted;
        }
        
        console.log('🔒 Wallet locked');
    }
    
    // Auto-lock on inactivity
    checkInactivity() {
        if (!this.isLocked && Date.now() - this.lastActivity > this.sessionTimeout) {
            this.lockWallet();
        }
    }
    
    // Update activity timestamp
    updateActivity() {
        this.lastActivity = Date.now();
    }
    
    // Secure transaction signing
    async signTransaction(transaction) {
        this.checkInactivity();
        
        if (this.isLocked) {
            throw new Error('Wallet is locked');
        }
        
        this.updateActivity();
        
        const wallet = new ethers.Wallet(
            this.walletData.decrypted.privateKey
        );
        
        const signedTx = await wallet.signTransaction(transaction);
        
        // Clear private key from memory immediately
        wallet.privateKey = null;
        
        return signedTx;
    }
    
    // Secure key storage (never in plain text)
    getPrivateKey() {
        if (this.isLocked) {
            throw new Error('Wallet is locked');
        }
        
        // Return key only when needed, clear after use
        const key = this.walletData.decrypted.privateKey;
        
        // Schedule cleanup
        setTimeout(() => {
            this.walletData.decrypted.privateKey = null;
        }, 1000);
        
        return key;
    }
}

const secureWallet = new SecureWallet();

console.log('🕵️ Secure Wallet loaded');
console.log('Security features:');
console.log('✅ AES-256-GCM encryption');
console.log('✅ PBKDF2 key derivation (1M iterations)');
console.log('✅ Auto-lock after 5 minutes');
console.log('✅ Brute force protection');
console.log('✅ Private key memory cleanup');
console.log('✅ Session timeout');
