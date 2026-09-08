// Security Headers Configuration
const SECURITY_HEADERS = {
    'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "connect-src 'self' https://eth.llamarpc.com https://arb1.arbitrum.io",
        "font-src 'self'",
        "object-src 'none'",
        "frame-ancestors 'none'"
    ].join('; '),
    
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()'
};

// Apply security headers (for server-side)
function applySecurityHeaders(req, res, next) {
    for (const [header, value] of Object.entries(SECURITY_HEADERS)) {
        res.setHeader(header, value);
    }
    next();
}

console.log('🛡️ Security headers configured');
