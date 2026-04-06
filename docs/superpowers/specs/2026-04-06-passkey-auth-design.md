# Passkey Authentication for Admin Portal

> Replace ADMIN_SECRET password login with WebAuthn passkeys. Multi-user, invite-based registration, session cookies.

## Context

The admin portal currently uses a shared `ADMIN_SECRET` pasted into a password field, stored in `sessionStorage`, and sent as a Bearer token. This is single-factor, phishable, and requires sharing the secret with every admin.

Passkeys (WebAuthn) provide phishing-resistant, device-bound authentication with no shared secrets after initial setup.

## Architecture

### Dependencies

- `@simplewebauthn/server` v13+ (npm) — server-side WebAuthn registration/authentication
- `@simplewebauthn/browser` v13+ (CDN via unpkg) — client-side WebAuthn API wrapper
- `cookie-parser` (npm) — Express cookie parsing middleware

### New Files

- `auth.js` — WebAuthn registration, authentication, session management, invite system
- `specs/migrations/006-admin-passkeys.sql` — database schema

### Modified Files

- `webhook.js` — mount `cookie-parser`, updated `verifyAdmin` middleware, new auth route mounting under `/api/admin/auth/*`
- `public/admin.html` — passkey login UI, registration flow, invite management

## Database Schema (Migration 006)

```sql
-- Admin users
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  invited_by UUID REFERENCES admin_users(id)
);

-- WebAuthn credentials (one user can have multiple passkeys)
CREATE TABLE admin_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] DEFAULT '{}',
  name TEXT DEFAULT 'My passkey',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Sessions (cookie-based)
CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Invite codes (single-use, time-limited)
CREATE TABLE admin_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES admin_users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE INDEX idx_admin_credentials_user ON admin_credentials(user_id);
CREATE INDEX idx_admin_invites_code ON admin_invites(code_hash);
```

## Auth Flows

All auth routes are mounted under `/api/admin/auth/*` so the session cookie (Path=/api/admin) covers them.

### 1. Bootstrap (First User)

Triggered when `admin_users` table is empty. Protected by `ADMIN_SECRET`. Rate-limited (3/min/IP).

```
Client                          Server
  |                               |
  |  POST /api/admin/auth/bootstrap
  |  { username }                 |
  |  Header: X-Bootstrap-Key      |
  |------------------------------>|
  |                               | Rate limit check
  |                               | Verify ADMIN_SECRET
  |                               | Check admin_users is empty
  |                               | Generate WebAuthn challenge
  |                               | Store challenge keyed by challengeId
  |  { options, challengeId }     |
  |<------------------------------|
  |                               |
  |  [User touches authenticator] |
  |                               |
  |  POST /api/admin/auth/register
  |  { challengeId, credential }  |
  |------------------------------>|
  |                               | Look up challenge by challengeId
  |                               | Re-check admin_users is STILL empty
  |                               | Verify WebAuthn credential
  |                               | Create admin_user
  |                               | Store credential
  |                               | Create session
  |  Set-Cookie: admin_session    |
  |  { ok: true, user }          |
  |<------------------------------|
```

### 2. Login (Existing User)

Rate-limited (10/min/IP).

```
Client                          Server
  |                               |
  |  POST /api/admin/auth/login-challenge
  |------------------------------>|
  |                               | Load all credentials
  |                               | Generate challenge
  |                               | Store challenge keyed by challengeId
  |  { options, challengeId }     |
  |<------------------------------|
  |                               |
  |  [User touches authenticator] |
  |                               |
  |  POST /api/admin/auth/login-verify
  |  { challengeId, credential }  |
  |------------------------------>|
  |                               | Look up challenge by challengeId
  |                               | Verify assertion
  |                               | Update counter + last_used_at
  |                               | Create session
  |                               | Clean expired sessions
  |  Set-Cookie: admin_session    |
  |  { ok: true, user }          |
  |<------------------------------|
```

### 3. Invite New Admin

Requires existing admin session. Rate-limited (5/min).

```
Existing Admin                  Server                    New Admin
  |                               |                         |
  |  POST /api/admin/auth/invite  |                         |
  |------------------------------>|                         |
  |                               | Generate 32 random bytes|
  |  { inviteCode, inviteUrl,    | Hash + store in DB      |
  |    expiresAt }               |                         |
  |<------------------------------|                         |
  |                               |                         |
  |  [Share URL out-of-band]      |                         |
  |                               |                         |
  |                               |  GET /admin?invite=CODE |
  |                               |  → shows register form  |
  |                               |                         |
  |                               |  POST /api/admin/auth/register
  |                               |  { challengeId,         |
  |                               |    invite, credential } |
  |                               |<------------------------|
  |                               | Verify invite (valid,   |
  |                               |   not expired, not used)|
  |                               | Mark invite used_at     |
  |                               | Create user + credential|
  |                               | Create session          |
  |                               |  Set-Cookie + { user }  |
  |                               |------------------------>|
```

The `/api/admin/auth/register` endpoint determines the flow by checking:
- If `invite` field present → invite registration flow (validate invite code)
- If no `invite` → bootstrap flow (challenge must be bootstrap type, re-verify admin_users is empty)

### 4. ADMIN_SECRET Fallback

Bearer token auth continues to work for CLI/API access. `verifyAdmin` checks in order:
1. Session cookie → parse `admin_session` cookie, SHA-256 hash it, look up in `admin_sessions`, verify not expired
2. Bearer token → compare against `ADMIN_SECRET` with timing-safe compare

## Challenge Store

In-memory `Map<challengeId, { challenge, type, username?, userId?, expires }>`.

- **Key**: Random UUID generated per challenge request, returned to client as `challengeId`
- **Type**: `'bootstrap'` | `'invite'` | `'login'`
- **Expiry**: 5 minutes from creation
- **Cleanup**: On every new challenge creation, sweep and delete entries where `expires < Date.now()`. Also a `setInterval` every 5 minutes as fallback (`.unref()` to not block shutdown).
- **Correlation**: Client must send back the `challengeId` in the verify/register request. Server looks up the stored challenge by this ID.

## Session Management

- **Token**: 32 random bytes, hex-encoded (64 chars)
- **Storage**: SHA-256 hash of token stored in `admin_sessions`
- **Cookie**: `admin_session=<token>; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=604800`
- **Expiry**: 7 days from creation
- **Logout**: POST `/api/admin/auth/logout` — removes session from DB, clears cookie
- **Cleanup**: Expired sessions purged on each successful login (`DELETE FROM admin_sessions WHERE expires_at < now()`)

## auth.js Module API

```javascript
// Challenge store (in-memory, short-lived)
// Map<challengeId, { challenge, type, username?, userId?, expires }>
// Cleanup: sweep expired on each new challenge + setInterval every 5min

// Registration
generateBootstrapOptions(username)        // → { options, challengeId }
generateInviteRegOptions(username, invite) // → { options, challengeId }
verifyRegistration(challengeId, credential) // → { user, sessionToken }
  // Checks challenge type to determine bootstrap vs invite flow
  // Bootstrap: re-verifies admin_users is empty
  // Invite: validates invite code, marks used

// Authentication
generateLoginOptions()                    // → { options, challengeId }
verifyLogin(challengeId, credential)      // → { user, sessionToken }

// Sessions
createSession(userId)                     // → { token, expiresAt }
validateSession(rawToken)                 // → user | null (hashes internally with SHA-256)
destroySession(rawToken)                  // → void (hashes internally)
cleanExpiredSessions()                    // → count removed

// Invites
createInvite(adminUserId)                 // → { code, expiresAt }
validateInvite(rawCode)                   // → invite | null (hashes internally)
markInviteUsed(inviteId)                  // → void

// Config
const RP_ID    // from WEBAUTHN_RP_ID or hostname of WEBHOOK_BASE_URL
const RP_NAME  // 'Flat White Index Admin'
const RP_ORIGIN // from WEBAUTHN_ORIGIN or WEBHOOK_BASE_URL
```

## Frontend Changes (admin.html)

### Login Page States

1. **Bootstrap mode** (no users exist — detected via `GET /api/admin/auth/status` returning `{ needsBootstrap: true }`): Shows username input + setup key input + "Register with passkey" button.
2. **Normal login**: Shows "Sign in with passkey" button only. No username needed (WebAuthn discoverable credentials).
3. **Invite registration**: URL param `?invite=CODE` shows username input + "Register with passkey" button.

### Admin Panel Additions

- System tab: "Invite admin" button → generates code → shows copyable invite URL
- System tab: "Active admins" list showing username, credential count, last login
- Header: shows current username, logout button

### Client-Side Library

```html
<script src="https://unpkg.com/@simplewebauthn/browser@13/dist/bundle/index.umd.min.js"></script>
```

Accessed via `SimpleWebAuthnBrowser.startRegistration()` / `SimpleWebAuthnBrowser.startAuthentication()`.

## Environment Variables

```
# Existing
ADMIN_SECRET=             # Still used for bootstrap + API fallback

# New (optional — auto-derived from WEBHOOK_BASE_URL if not set)
WEBAUTHN_RP_ID=           # Relying Party ID (domain)
WEBAUTHN_ORIGIN=          # Expected origin
```

## Security Considerations

- **Challenge correlation**: Each challenge gets a random UUID key; client must return it. Prevents cross-request confusion.
- **Bootstrap race condition**: Register endpoint re-checks `admin_users` is empty before completing bootstrap registration.
- **Challenge expiry**: 5 minutes, in-memory with periodic cleanup to prevent memory leaks.
- **Credential counter**: Verified and incremented on each login to detect cloned keys.
- **Invite brute-force**: Rate-limited (5/min/IP), codes are 32 random bytes (base64url).
- **Bootstrap brute-force**: Rate-limited (3/min/IP), protects ADMIN_SECRET.
- **Login rate-limit**: 10/min/IP on challenge endpoint to prevent memory exhaustion.
- **Session tokens**: Cryptographically random, only SHA-256 hash stored in DB. `validateSession` hashes the raw cookie value internally.
- **Cookie scope**: Path `/api/admin` — not sent on public requests. `HttpOnly; Secure; SameSite=Strict`.
- **ADMIN_SECRET retained**: Fallback for CLI/API access, required for bootstrap only.
- **No username enumeration**: Login challenge returns valid options regardless of user existence.
- **CSRF**: `SameSite=Strict` cookie + no cross-origin embedding of admin panel mitigates CSRF.
- **trust proxy**: Already set (`app.set('trust proxy', 1)`) for Secure cookies behind Cloudflare.

## Migration Path

1. Deploy migration 006 (creates tables, no data impact)
2. `npm install @simplewebauthn/server cookie-parser`
3. Deploy code changes (new auth routes + updated verifyAdmin)
4. First admin visits /admin → sees bootstrap mode → registers passkey using ADMIN_SECRET
5. Subsequent admins get invite links
6. ADMIN_SECRET continues working for API/script access

## Testing

- Unit tests for auth.js: challenge generation, session lifecycle (create/validate/destroy/expire), invite flow (create/validate/use/expire/reuse-blocked)
- WebAuthn verification: mock `@simplewebauthn/server` functions, test credential storage/retrieval
- Integration: bootstrap → login → invite → new user login → logout
- Edge cases: expired sessions, expired invites, reused invites, invalid credentials, counter mismatch, bootstrap race condition, concurrent challenges
- Rate limiting: verify bootstrap, login-challenge, and invite endpoints are rate-limited
