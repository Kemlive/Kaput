// Secure Storage - Never store plain text keys
class SecureStorage {
    constructor() {
        this.storage = null;
        this.encryptionKey = null;
    }
    
    // Initialize secure storage
    async init(password) {
        // Generate encryption key
        const salt = crypto.getRandomValues(new Uint8Array(32));
        this.encryptionKey = await this.deriveKey(password, salt);
        
        // Store salt for later
        localStorage.setItem('kaput_salt', JSON.stringify(Array.from(salt)));
        
        return true;
    }
    
    // Derive key from password
    async deriveKey(password, salt) {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveKey']
        );
        
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: 1000000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }
    
    // Save encrypted data
    async save(key, value) {
        const encrypted = await this.encrypt(JSON.stringify(value));
        localStorage.setItem(key, JSON.stringify(encrypted));
    }
    
    // Load and decrypt data
    async load(key) {
        const encrypted = JSON.parse(localStorage.getItem(key));
        if (!encrypted) return null;
        
        const decrypted = await this.decrypt(encrypted);
        return JSON.parse(decrypted);
    }
    
    // Encrypt value
    async encrypt(value) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            this.encryptionKey,
            new TextEncoder().encode(value)
        );
        
        return {
            ciphertext: Array.from(new Uint8Array(encrypted)),
            iv: Array.from(iv)
        };
    }
    
    // Decrypt value
    async decrypt(encryptedData) {
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: new Uint8Array(encryptedData.iv) },
            this.encryptionKey,
            new Uint8Array(encryptedData.ciphertext)
        );
        
        return new TextDecoder().decode(decrypted);
    }
    
    // Clear all data
    clearAll() {
        localStorage.removeItem('kaput_salt');
        localStorage.removeItem('kaput_wallet');
        localStorage.removeItem('kaput_settings');
    }
}
