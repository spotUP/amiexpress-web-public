# AmiExpress-Web Security Audit Report

**Audit Date:** 2026-01-04
**Auditor:** Automated Security Review
**Scope:** Backend security (SQL injection, XSS, CSRF, authentication, session management)

---

## Executive Summary

AmiExpress-Web implements most security best practices for a BBS system. Critical vulnerabilities found: 1 SQL injection, overly permissive CORS, no CSRF protection. Password security and JWT authentication are properly implemented with industry-standard practices.

**Risk Level:** MEDIUM
**Production Readiness:** Requires fixes before production deployment

---

## 1. SQL Injection Vulnerabilities

### CRITICAL: String Interpolation in SQL Query

**Location:** `web/backend/src/handlers/file/file-maintenance.handler.ts:701`

**Issue:**
```typescript
const rows = await _db.query(`SELECT value FROM system_config WHERE key LIKE '${key}.%'`);
```

**Risk:** HIGH (though mitigated by limited input scope)

**Impact:** SQL injection vulnerability using template literals. However, `key` parameter is restricted to hardcoded values `['DLPATH', 'ULPATH']` from the function signature, limiting exploitation.

**Fix Required:**
```typescript
// BEFORE (vulnerable)
const rows = await _db.query(`SELECT value FROM system_config WHERE key LIKE '${key}.%'`);

// AFTER (secure)
const rows = await _db.query(`SELECT value FROM system_config WHERE key LIKE ? || '.%'`, [key]);
```

**Status:** MUST FIX before production

### Verified Safe: Placeholder Pattern

**Location:** `web/backend/src/handlers/file/download.handler.ts:477`

**Code:**
```typescript
const placeholders = areaIds.map(() => '?').join(',');
const result = await db.query(`SELECT id, path FROM file_areas WHERE id IN (${placeholders})`, areaIds);
```

**Status:** SECURE - Correctly uses parameterized placeholders

---

## 2. Cross-Site Scripting (XSS)

### Limited Risk in Terminal Context

**Assessment:** LOW RISK for BBS/terminal interface, MEDIUM RISK for web admin interface

**Current Implementation:**
- User data emitted directly via `socket.emit('ansi-output', ...)` with template literals
- ANSI stripping implemented for plain text mode (`AnsiUtil.stripAnsiForPlainText`)
- Input sanitization limited to trimming whitespace (`sanitizeInput` in `utils/input-normalizer.util.ts`)

**Risk Analysis:**
- Terminal/BBS context: Users see ANSI sequences, not HTML - XSS less critical
- Web admin interface: May need HTML escaping for user-generated content
- Message bodies, usernames, locations displayed without HTML encoding

**Current Mitigations:**
```typescript
// ANSI filter for plain text mode (auth-socket-handlers.ts:47-60)
const installAnsiFilter = (sock: Socket, sess: any) => {
  sock.emit = ((event: string, ...args: any[]) => {
    if (event === 'ansi-output' && (sess.ansiMode === false || sess.user?.ansi === false)) {
      const filtered = args.map((arg) =>
        typeof arg === 'string' ? AnsiUtil.stripAnsiForPlainText(arg) : arg
      );
      return originalEmit(event, ...filtered);
    }
    return originalEmit(event, ...args);
  }) as any;
};
```

**Recommendations:**
1. Add HTML escaping for web admin interface displaying user content
2. Consider sanitizing message bodies for control characters
3. Implement content security policy (CSP) headers for web interface

**Status:** ACCEPTABLE for terminal BBS, REVIEW for web admin

---

## 3. Cross-Site Request Forgery (CSRF)

### No CSRF Protection Implemented

**Assessment:** MEDIUM RISK

**Current Implementation:**
- No CSRF tokens found in codebase
- Socket.IO connections use JWT authentication
- REST API endpoints protected by JWT tokens

**Risk Analysis:**
- Socket.IO: Uses persistent connections with JWT - CSRF less applicable
- REST API: State-changing operations (POST/PUT/DELETE) lack CSRF tokens
- Admin interface: Configuration changes vulnerable to CSRF

**Affected Endpoints:**
- `/api/config` - System configuration (requires sysop auth)
- `/api/batches` - Batch management (requires sysop auth)
- `/api/import` - User import (requires sysop auth)
- `/api/info-editor` - Info file editing (requires sysop auth)
- `/api/globalwall` - Global wall messages (requires sysop auth)

**Current Mitigations:**
- All sensitive endpoints require JWT authentication (`authenticateToken(db)`)
- Sysop-only endpoints require additional `requireSysop()` middleware
- SameSite cookie settings may provide partial protection

**Recommendations:**
1. **CRITICAL:** Implement CSRF tokens for all state-changing REST API operations
2. Add CSRF middleware (e.g., `csurf` package)
3. Include CSRF tokens in forms/API requests from frontend
4. Set `SameSite=Strict` for cookies

**Status:** MUST FIX for production (sysop endpoints especially critical)

---

## 4. Password Security

### SECURE: Industry-Standard Bcrypt Hashing

**Implementation:** `bcrypt` with 10 rounds (industry standard)

**Locations:**
- `database.ts:2384` - Password hashing
- `database.ts:2396` - Password verification
- `new-user.handler.ts:1096` - New user registration
- `user-editor.handler.ts:617` - Password changes
- `config-routes.ts:1266, 1363, 1379` - User management

**Code:**
```typescript
// Hashing (database.ts:2384)
return await bcrypt.hash(password, saltRounds); // saltRounds = 10

// Verification (database.ts:2396)
return await bcrypt.compare(password, hash);
```

**Strengths:**
- ✅ Bcrypt 10 rounds (2^10 = 1024 iterations) - sufficient for 2026
- ✅ Async hashing prevents blocking
- ✅ Constant-time comparison prevents timing attacks
- ✅ No plaintext storage

**Status:** SECURE

---

## 5. JWT Token Security

### SECURE: Proper JWT Implementation

**Implementation:** `jsonwebtoken` with configurable secrets and expiration

**Code:**
```typescript
// Standard token - 8 hour expiration (database.ts:2412)
return jwt.sign(payload, secret, { expiresIn: '8h' });

// Refresh token - 7 day expiration (database.ts:2422)
return jwt.sign(payload, secret, { expiresIn: '7d' });

// Verification (database.ts:2429)
const decoded = jwt.verify(token, secret) as any;
```

**Strengths:**
- ✅ Short-lived tokens (8 hours) reduce exposure window
- ✅ Refresh tokens for long sessions (7 days)
- ✅ JWT verification before accepting tokens
- ✅ Configurable secret (JWT_SECRET environment variable)

**Critical Requirements:**
- ⚠️ **MUST use strong JWT_SECRET in production** (64+ random bytes)
- ⚠️ **NEVER commit JWT_SECRET to version control**
- ⚠️ **Rotate secrets periodically**

**Production Deployment Guide:** See `PRODUCTION_DEPLOYMENT.md` for secret generation:
```bash
export JWT_SECRET=$(openssl rand -base64 64)
export SESSION_SECRET=$(openssl rand -base64 64)
```

**Status:** SECURE (if secrets properly configured)

---

## 6. CORS Configuration

### INSECURE: Overly Permissive CORS

**Location:** `web/backend/src/server/app.ts:24`

**Current Configuration:**
```typescript
app.use(cors()); // Allows ALL origins
```

**Risk:** HIGH in production

**Impact:**
- Any website can make requests to BBS API
- Credentials may be exposed to malicious sites
- Enables potential CSRF attacks

**Required Fix:**
```typescript
// BEFORE (insecure - allows all origins)
app.use(cors());

// AFTER (secure - restrict to known origins)
const allowedOrigins = [
  'https://yourbbs.example.com',
  'https://admin.yourbbs.example.com',
  process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : null
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
```

**Status:** MUST FIX before production

---

## 7. Session Management

### SECURE: Robust Session Handling

**Features:**
- ✅ Session restoration with 2-minute expiration window
- ✅ IP ban management (`security/ip-ban-manager`)
- ✅ Password attempt limiting (configurable `max_password_fails`)
- ✅ Session invalidation on logout
- ✅ User session tracking per node

**Code:**
```typescript
// Session expiration check (auth-socket-handlers.ts:91-95)
if (sessionData.savedAt && Date.now() - sessionData.savedAt > 120000) {
  console.log('[Session Restore] Session expired (> 2 minutes old)');
  socket.emit('session-restore-failed', 'Session expired');
  return;
}

// Password attempt limiting (auth-socket-handlers.ts:62-77)
const getMaxPasswordFails = () => {
  // Configurable from database (default: 5)
  return sys?.max_password_fails || 5;
};
```

**Strengths:**
- Short session restoration window prevents stale sessions
- Configurable password attempt limits
- IP-based access control
- Session cleanup on disconnect

**Status:** SECURE

---

## 8. Input Validation

### LIMITED: Basic Trimming Only

**Current Implementation:** `utils/input-normalizer.util.ts`

```typescript
export function sanitizeInput(value: string | undefined | null): string {
  return (value ?? '').trim();
}

export function normalizeForComparison(value: string | undefined | null): string {
  return sanitizeInput(value).toLowerCase();
}
```

**Assessment:** MINIMAL sanitization

**Gaps:**
- No SQL escape characters filtering
- No HTML/script tag removal
- No control character filtering
- No length validation
- No pattern validation (email, phone, etc.)

**Recommendations:**
1. Add input length validation for all user fields
2. Validate email format for email fields
3. Strip control characters from text inputs
4. Add regex pattern validation for structured fields
5. Consider using validation library (e.g., `joi`, `zod`)

**Status:** ACCEPTABLE for BBS context, ENHANCE for production

---

## 9. Additional Security Findings

### Rate Limiting: NOT IMPLEMENTED

**Current State:** No rate limiting on API endpoints or Socket.IO events

**Risks:**
- Brute force password attacks
- API abuse
- DoS via excessive requests

**Required Mitigations:**
1. Implement rate limiting middleware (e.g., `express-rate-limit`)
2. Limit login attempts per IP (already partially done via password fails)
3. Rate limit Socket.IO events
4. Add nginx rate limiting (see PRODUCTION_DEPLOYMENT.md)

**Status:** MUST ADD for production

### Security Headers: PARTIAL

**Current State:** No security headers middleware found

**Missing Headers:**
- `Strict-Transport-Security` (HSTS)
- `X-Content-Type-Options`
- `X-Frame-Options`
- `Content-Security-Policy`

**Fix:** Add `helmet` middleware or configure nginx (recommended in PRODUCTION_DEPLOYMENT.md)

**Status:** MUST ADD for production

### Secrets Management: GOOD

**Found:** `utils/secrets-encryption.util.ts` - Encryption utilities for sensitive data

**Status:** SECURE

---

## Security Checklist for Production

**Critical (MUST FIX):**
- [ ] Fix SQL injection in file-maintenance.handler.ts:701
- [ ] Configure CORS to restrict allowed origins
- [ ] Implement CSRF protection for REST API endpoints
- [ ] Generate strong JWT_SECRET and SESSION_SECRET (64+ bytes)
- [ ] Add rate limiting middleware
- [ ] Configure security headers (via helmet or nginx)

**Important (SHOULD FIX):**
- [ ] Add HTML escaping for web admin interface
- [ ] Implement input validation library
- [ ] Add HTTPS enforcement (HSTS headers)
- [ ] Configure CSP headers for web interface
- [ ] Add API request logging/monitoring
- [ ] Implement alert system for security events

**Recommended (NICE TO HAVE):**
- [ ] Add 2FA for sysop accounts
- [ ] Implement account lockout after failed attempts
- [ ] Add security audit logging
- [ ] Implement intrusion detection
- [ ] Add automated security scanning to CI/CD

---

## Remediation Priority

1. **IMMEDIATE (Week 1):**
   - Fix SQL injection vulnerability
   - Configure CORS restrictions
   - Generate production secrets
   - Add CSRF protection

2. **HIGH (Week 2):**
   - Implement rate limiting
   - Add security headers
   - Add HTML escaping for admin interface

3. **MEDIUM (Week 3-4):**
   - Enhanced input validation
   - Security monitoring/logging
   - Automated security testing

---

## Testing Recommendations

1. **Automated Security Testing:**
   - OWASP ZAP scan
   - SQL injection testing (sqlmap)
   - XSS testing (XSStrike)
   - CSRF testing (Burp Suite)

2. **Manual Penetration Testing:**
   - Authentication bypass attempts
   - Session hijacking tests
   - Input validation fuzzing
   - API abuse testing

3. **Code Review:**
   - Review all database queries for parameterization
   - Audit user input handling
   - Check authentication/authorization logic
   - Review session management

---

## Conclusion

AmiExpress-Web has a solid security foundation with proper password hashing and JWT authentication. However, several critical issues must be addressed before production deployment:

1. SQL injection vulnerability (file-maintenance.handler.ts)
2. Overly permissive CORS configuration
3. Missing CSRF protection
4. Missing rate limiting
5. Missing security headers

**Estimated Remediation Time:** 2-3 days for critical fixes

**Next Steps:**
1. Fix critical vulnerabilities (SQL injection, CORS, CSRF)
2. Add rate limiting and security headers
3. Perform security testing
4. Deploy to production with proper secrets

---

**Report Generated:** 2026-01-04
**Audit Tool:** Manual code review + automated grep analysis
**Review Status:** Complete
