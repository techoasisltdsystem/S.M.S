// Password hashing: salted PBKDF2-HMAC-SHA256, synchronous and dependency-free.
// Stored format: pbkdf2-sha256$<iterations>$<salt hex>$<hash hex>. Plain passwords are never stored.
// NOTE: in production, hash on the server (or use your auth provider); this keeps the browser build honest.
(function () {
    const TOS = window.TOS = window.TOS || {};
    const K = new Uint32Array([0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
    const W = new Uint32Array(64);

    function sha256(bytes) {
        const len = bytes.length, total = ((len + 9 + 63) >> 6) << 6;
        const m = new Uint8Array(total); m.set(bytes); m[len] = 0x80;
        const bits = len * 8; m[total - 4] = bits >>> 24; m[total - 3] = bits >>> 16; m[total - 2] = bits >>> 8; m[total - 1] = bits;
        m[total - 8] = Math.floor(bits / 0x100000000) >>> 24 & 0xff; m[total - 7] = Math.floor(bits / 0x100000000) >>> 16 & 0xff; m[total - 6] = Math.floor(bits / 0x100000000) >>> 8 & 0xff; m[total - 5] = Math.floor(bits / 0x100000000) & 0xff;
        let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a, h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;
        for (let o = 0; o < total; o += 64) {
            for (let i = 0; i < 16; i++) W[i] = (m[o + i * 4] << 24) | (m[o + i * 4 + 1] << 16) | (m[o + i * 4 + 2] << 8) | m[o + i * 4 + 3];
            for (let i = 16; i < 64; i++) {
                const a = W[i - 15], b = W[i - 2];
                const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
                const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
                W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
            }
            let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
            for (let i = 0; i < 64; i++) {
                const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
                const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
                const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
                const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
                h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
            }
            h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0;
        }
        const out = new Uint8Array(32);
        [h0, h1, h2, h3, h4, h5, h6, h7].forEach((v, i) => { out[i * 4] = v >>> 24; out[i * 4 + 1] = v >>> 16; out[i * 4 + 2] = v >>> 8; out[i * 4 + 3] = v; });
        return out;
    }
    const utf8 = s => new TextEncoder().encode(String(s));
    const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
    const unhex = h => new Uint8Array(String(h).match(/../g).map(x => parseInt(x, 16)));
    const concat = (a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; };

    function hmac(key, msg) {
        if (key.length > 64) key = sha256(key);
        const k = new Uint8Array(64); k.set(key);
        const ipad = k.map(x => x ^ 0x36), opad = k.map(x => x ^ 0x5c);
        return sha256(concat(opad, sha256(concat(ipad, msg))));
    }
    function pbkdf2(password, salt, iterations) {
        let key = utf8(password); if (key.length > 64) key = sha256(key);
        const k = new Uint8Array(64); k.set(key);
        // Reusable buffers: [ipad | 32-byte U] and [opad | 32-byte inner hash]
        const inner = new Uint8Array(96), outer = new Uint8Array(96);
        for (let i = 0; i < 64; i++) { inner[i] = k[i] ^ 0x36; outer[i] = k[i] ^ 0x5c; }
        let u = hmac(key, concat(salt, new Uint8Array([0, 0, 0, 1])));
        const t = u.slice();
        for (let i = 1; i < iterations; i++) {
            inner.set(u, 64); outer.set(sha256(inner), 64); u = sha256(outer);
            for (let j = 0; j < 32; j++) t[j] ^= u[j];
        }
        return t;
    }

    const ITERATIONS = 4000;
    function hashPassword(password) {
        const salt = crypto.getRandomValues(new Uint8Array(16));
        return `pbkdf2-sha256$${ITERATIONS}$${hex(salt)}$${hex(pbkdf2(password, salt, ITERATIONS))}`;
    }
    function verifyPassword(password, stored) {
        if (!stored || typeof stored !== 'string') return false;
        const [alg, it, salt, hash] = stored.split('$');
        if (alg !== 'pbkdf2-sha256' || !salt || !hash) return false;
        const calc = hex(pbkdf2(password, unhex(salt), +it));
        let diff = 0; for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ hash.charCodeAt(i);   // constant time
        return diff === 0 && calc.length === hash.length;
    }
    // Random URL-safe token (email verification, password reset); only its hash is stored
    const token = () => hex(crypto.getRandomValues(new Uint8Array(24)));
    const hashToken = t => hex(sha256(utf8(t)));

    TOS.crypto = { sha256: s => hex(sha256(utf8(s))), hashPassword, verifyPassword, token, hashToken, isHash: v => typeof v === 'string' && v.startsWith('pbkdf2-sha256$') };
})();
