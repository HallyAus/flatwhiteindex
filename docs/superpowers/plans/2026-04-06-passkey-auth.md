# Passkey Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shared ADMIN_SECRET password login with WebAuthn passkeys — multi-user, invite-based, session cookies.

**Architecture:** New `auth.js` module handles all WebAuthn + session logic. Express cookie-parser parses session cookies. `verifyAdmin` middleware checks session cookie first, falls back to Bearer token. Frontend uses `@simplewebauthn/browser` bundled locally in `public/vendor/`. Four new Supabase tables.

**Tech Stack:** @simplewebauthn/server, @simplewebauthn/browser (local bundle), cookie-parser, node:crypto, Supabase PostgreSQL

**Key implementation notes:**
- The `@simplewebauthn/browser` UMD bundle must be copied to `public/vendor/` (not CDN) because CSP blocks external scripts. Download once at install time.
- `@simplewebauthn/server` v13 returns `Uint8Array` for credential IDs and public keys. We encode to base64url for DB storage and decode back for verification.
- Cookie `Secure` flag is always `true` (production behind Cloudflare TLS). No `NODE_ENV` check.
- Invite codes have a tiny double-spend window between challenge generation and registration completion. Accepted as low-risk since invites are shared out-of-band to trusted people. The window is ~seconds.
- Tasks 5 and 6 must be deployed together — the new auth routes in Task 5 depend on the updated `verifyAdmin` from Task 6.
- Username validation: `/^[a-zA-Z0-9_-]{2,50}$/` — alphanumeric, hyphens, underscores only.

**Spec:** `docs/superpowers/specs/2026-04-06-passkey-auth-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `specs/migrations/006-admin-passkeys.sql` | Create | Database schema — 4 tables, indexes |
| `auth.js` | Create | WebAuthn registration/authentication, session CRUD, invite CRUD, challenge store |
| `test/auth.test.js` | Create | Unit tests for auth.js |
| `webhook.js` | Modify | Mount cookie-parser, new auth routes, updated verifyAdmin |
| `public/admin.html` | Modify | Passkey login UI, invite management in System tab |
| `public/vendor/simplewebauthn-browser.umd.min.js` | Create | Local copy of @simplewebauthn/browser UMD bundle |
| `package.json` | Modify | Add @simplewebauthn/server, cookie-parser |
| `env.example` | Modify | Add WEBAUTHN_RP_ID, WEBAUTHN_ORIGIN (optional) |

---

### Task 1: Database Migration

**Files:**
- Create: `specs/migrations/006-admin-passkeys.sql`

- [ ] **Step 1: Write the migration SQL**

```sql
-- Migration 006: Admin passkey authentication
-- Run in Supabase SQL Editor

CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  invited_by UUID REFERENCES admin_users(id)
);

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

CREATE TABLE admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  token_hash TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE admin_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash TEXT UNIQUE NOT NULL,
  created_by UUID NOT NULL REFERENCES admin_users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ
);

CREATE INDEX idx_admin_sessions_token ON admin_sessions(token_hash);
CREATE INDEX idx_admin_sessions_expires ON admin_sessions(expires_at);
CREATE INDEX idx_admin_credentials_user ON admin_credentials(user_id);
CREATE INDEX idx_admin_invites_code ON admin_invites(code_hash);
```

- [ ] **Step 2: Commit**

```bash
git add -f specs/migrations/006-admin-passkeys.sql
git commit -m "feat(auth): add migration 006 — admin passkey tables"
```

---

### Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install @simplewebauthn/server cookie-parser
```

- [ ] **Step 2: Download @simplewebauthn/browser UMD bundle locally**

```bash
mkdir -p public/vendor
curl -o public/vendor/simplewebauthn-browser.umd.min.js https://unpkg.com/@simplewebauthn/browser@13/dist/bundle/index.umd.min.js
```

This avoids CSP issues — no external script domains needed.

- [ ] **Step 3: Add `public/vendor/` to CSP script-src**

In `webhook.js`, the existing `script-src` already has `'self'` which covers files served from `public/`. No change needed since the bundle lives under the static directory.

- [ ] **Step 4: Verify package.json updated**

Check `package.json` has `@simplewebauthn/server` and `cookie-parser` in dependencies.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json public/vendor/simplewebauthn-browser.umd.min.js
git commit -m "feat(auth): add @simplewebauthn/server, cookie-parser, and browser bundle"
```

---

### Task 3: auth.js — Session & Invite Functions (TDD)

**Files:**
- Create: `auth.js`
- Create: `test/auth.test.js`

These are pure functions that don't depend on WebAuthn — test them first.

- [ ] **Step 1: Write failing tests for session and invite helpers**

Create `test/auth.test.js`:

```javascript
import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

// We'll test the pure helper functions that don't need Supabase
// by mocking the supabase calls

describe("hashToken", () => {
  it("produces consistent SHA-256 hex hash", async () => {
    const { hashToken } = await import("../auth.js");
    const hash1 = hashToken("test-token");
    const hash2 = hashToken("test-token");
    assert.strictEqual(hash1, hash2);
    assert.strictEqual(hash1.length, 64); // SHA-256 hex = 64 chars
  });

  it("produces different hashes for different inputs", async () => {
    const { hashToken } = await import("../auth.js");
    const hash1 = hashToken("token-a");
    const hash2 = hashToken("token-b");
    assert.notStrictEqual(hash1, hash2);
  });
});

describe("generateToken", () => {
  it("produces 64-char hex string", async () => {
    const { generateToken } = await import("../auth.js");
    const token = generateToken();
    assert.strictEqual(token.length, 64);
    assert.ok(/^[0-9a-f]+$/.test(token));
  });

  it("produces unique tokens", async () => {
    const { generateToken } = await import("../auth.js");
    const a = generateToken();
    const b = generateToken();
    assert.notStrictEqual(a, b);
  });
});

describe("challenge store", () => {
  it("stores and retrieves a challenge", async () => {
    const { storeChallengeData, getChallengeData } = await import("../auth.js");
    const id = storeChallengeData({ challenge: "abc", type: "login" });
    assert.ok(typeof id === "string");
    const data = getChallengeData(id);
    assert.strictEqual(data.challenge, "abc");
    assert.strictEqual(data.type, "login");
  });

  it("returns null for unknown challenge ID", async () => {
    const { getChallengeData } = await import("../auth.js");
    assert.strictEqual(getChallengeData("nonexistent"), null);
  });

  it("deletes challenge after retrieval", async () => {
    const { storeChallengeData, getChallengeData } = await import("../auth.js");
    const id = storeChallengeData({ challenge: "xyz", type: "bootstrap" });
    getChallengeData(id); // first retrieval consumes it
    assert.strictEqual(getChallengeData(id), null);
  });
});

describe("getRelyingParty", () => {
  it("returns RP config from env", async () => {
    const { getRelyingParty } = await import("../auth.js");
    const rp = getRelyingParty();
    assert.ok(rp.id);
    assert.ok(rp.name);
    assert.ok(rp.origin);
  });
});
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
node --test --test-force-exit ./test/auth.test.js
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement auth.js — helpers and challenge store**

Create `auth.js`:

```javascript
import { randomBytes, createHash, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// --- Supabase client (reuses same pattern as db.js) ---
let _supabase;
function supabase() {
  if (!_supabase) {
    _supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
  }
  return _supabase;
}

// --- Config ---
export function getRelyingParty() {
  const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://flatwhiteindex.com.au';
  const url = new URL(baseUrl);
  return {
    id: process.env.WEBAUTHN_RP_ID || url.hostname,
    name: 'Flat White Index Admin',
    origin: process.env.WEBAUTHN_ORIGIN || baseUrl,
  };
}

// --- Token helpers ---
export function generateToken() {
  return randomBytes(32).toString("hex");
}

export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

// --- Challenge store (in-memory, short-lived) ---
const CHALLENGE_TTL = 5 * 60 * 1000; // 5 minutes
const challenges = new Map();

export function storeChallengeData(data) {
  // Sweep expired on each store
  const now = Date.now();
  for (const [k, v] of challenges) {
    if (v.expires < now) challenges.delete(k);
  }
  const id = randomUUID();
  challenges.set(id, { ...data, expires: now + CHALLENGE_TTL });
  return id;
}

export function getChallengeData(id) {
  const entry = challenges.get(id);
  if (!entry) return null;
  challenges.delete(id); // single-use
  if (entry.expires < Date.now()) return null;
  return entry;
}

// Fallback cleanup interval
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of challenges) {
    if (v.expires < now) challenges.delete(k);
  }
}, 5 * 60 * 1000).unref();

// --- Sessions ---
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function createSession(userId) {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL).toISOString();
  const { error } = await supabase().from("admin_sessions").insert({
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expiresAt,
  });
  if (error) throw new Error(`createSession: ${error.message}`);
  return { token, expiresAt };
}

export async function validateSession(rawToken) {
  if (!rawToken) return null;
  const hash = hashToken(rawToken);
  const { data, error } = await supabase()
    .from("admin_sessions")
    .select("id, user_id, expires_at, admin_users(id, username)")
    .eq("token_hash", hash)
    .single();
  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data.admin_users;
}

export async function destroySession(rawToken) {
  if (!rawToken) return;
  const { error } = await supabase()
    .from("admin_sessions")
    .delete()
    .eq("token_hash", hashToken(rawToken));
  if (error) console.error("destroySession:", error.message);
}

export async function cleanExpiredSessions() {
  const { data, error } = await supabase()
    .from("admin_sessions")
    .delete()
    .lt("expires_at", new Date().toISOString())
    .select("id");
  return data?.length || 0;
}

// --- Invites ---
const INVITE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function createInvite(adminUserId) {
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_TTL).toISOString();
  const { error } = await supabase().from("admin_invites").insert({
    code_hash: hashToken(code),
    created_by: adminUserId,
    expires_at: expiresAt,
  });
  if (error) throw new Error(`createInvite: ${error.message}`);
  return { code, expiresAt };
}

export async function validateInvite(rawCode) {
  if (!rawCode) return null;
  const { data, error } = await supabase()
    .from("admin_invites")
    .select("*")
    .eq("code_hash", hashToken(rawCode))
    .is("used_at", null)
    .single();
  if (error || !data) return null;
  if (new Date(data.expires_at) < new Date()) return null;
  return data;
}

export async function markInviteUsed(inviteId) {
  const { error } = await supabase()
    .from("admin_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", inviteId);
  if (error) throw new Error(`markInviteUsed: ${error.message}`);
}

// --- Admin users ---
export async function getAdminUserCount() {
  const { count, error } = await supabase()
    .from("admin_users")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(`getAdminUserCount: ${error.message}`);
  return count || 0;
}

export async function createAdminUser(username, invitedBy = null) {
  const { data, error } = await supabase()
    .from("admin_users")
    .insert({ username, invited_by: invitedBy })
    .select("id, username")
    .single();
  if (error) throw new Error(`createAdminUser: ${error.message}`);
  return data;
}

export async function getAdminUsers() {
  const { data, error } = await supabase()
    .from("admin_users")
    .select("id, username, created_at, admin_credentials(id, name, last_used_at)")
    .order("created_at");
  if (error) throw new Error(`getAdminUsers: ${error.message}`);
  return data;
}

// --- Credentials ---
export async function storeCredential(userId, credential) {
  const { error } = await supabase().from("admin_credentials").insert({
    user_id: userId,
    credential_id: credential.credentialID,
    public_key: credential.credentialPublicKey,
    counter: credential.counter,
    transports: credential.transports || [],
    name: credential.name || "My passkey",
  });
  if (error) throw new Error(`storeCredential: ${error.message}`);
}

export async function getAllCredentials() {
  const { data, error } = await supabase()
    .from("admin_credentials")
    .select("credential_id, public_key, counter, transports, user_id");
  if (error) throw new Error(`getAllCredentials: ${error.message}`);
  return data;
}

export async function getCredentialsByUser(userId) {
  const { data, error } = await supabase()
    .from("admin_credentials")
    .select("credential_id, public_key, counter, transports")
    .eq("user_id", userId);
  if (error) throw new Error(`getCredentialsByUser: ${error.message}`);
  return data;
}

export async function updateCredentialCounter(credentialId, newCounter) {
  const { error } = await supabase()
    .from("admin_credentials")
    .update({ counter: newCounter, last_used_at: new Date().toISOString() })
    .eq("credential_id", credentialId);
  if (error) throw new Error(`updateCredentialCounter: ${error.message}`);
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
node --test --test-force-exit ./test/auth.test.js
```

Expected: PASS (4 describes, all green)

- [ ] **Step 5: Commit**

```bash
git add auth.js test/auth.test.js
git commit -m "feat(auth): add auth.js — sessions, invites, challenges, credential store"
```

---

### Task 4: auth.js — WebAuthn Registration & Authentication

**Files:**
- Modify: `auth.js` (add WebAuthn functions at the end)

These functions wrap `@simplewebauthn/server` and coordinate with the DB helpers from Task 3.

- [ ] **Step 1: Add WebAuthn registration functions**

Append to `auth.js`:

```javascript
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";

// --- WebAuthn Registration ---

export async function generateBootstrapRegOptions(username) {
  const count = await getAdminUserCount();
  if (count > 0) throw new Error("Bootstrap not available — admin users already exist");

  const rp = getRelyingParty();
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeId = storeChallengeData({
    challenge: options.challenge,
    type: "bootstrap",
    username,
  });

  return { options, challengeId };
}

export async function generateInviteRegOptions(username, inviteCode) {
  const invite = await validateInvite(inviteCode);
  if (!invite) throw new Error("Invalid or expired invite code");

  const rp = getRelyingParty();
  const options = await generateRegistrationOptions({
    rpName: rp.name,
    rpID: rp.id,
    userName: username,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const challengeId = storeChallengeData({
    challenge: options.challenge,
    type: "invite",
    username,
    inviteId: invite.id,
    inviteCreatedBy: invite.created_by,
  });

  return { options, challengeId };
}

export async function verifyAndCompleteRegistration(challengeId, credential) {
  const challengeData = getChallengeData(challengeId);
  if (!challengeData) throw new Error("Challenge expired or invalid");

  const rp = getRelyingParty();
  const verification = await verifyRegistrationResponse({
    response: credential,
    expectedChallenge: challengeData.challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
  });

  if (!verification.verified || !verification.registrationInfo) {
    throw new Error("Registration verification failed");
  }

  // Bootstrap: re-check that no users exist (race condition guard)
  if (challengeData.type === "bootstrap") {
    const count = await getAdminUserCount();
    if (count > 0) throw new Error("Bootstrap race: another user was created first");
  }

  // Invite: mark used
  let invitedBy = null;
  if (challengeData.type === "invite") {
    await markInviteUsed(challengeData.inviteId);
    invitedBy = challengeData.inviteCreatedBy;
  }

  // Create user + store credential
  const user = await createAdminUser(challengeData.username, invitedBy);
  const regInfo = verification.registrationInfo;

  await storeCredential(user.id, {
    credentialID: Buffer.from(regInfo.credential.id).toString("base64url"),
    credentialPublicKey: Buffer.from(regInfo.credential.publicKey).toString("base64url"),
    counter: regInfo.credential.counter,
    transports: credential.response?.transports || [],
  });

  // Create session
  const session = await createSession(user.id);
  await cleanExpiredSessions();

  return { user, session };
}

// --- WebAuthn Authentication ---

export async function generateLoginChallenge() {
  const allCreds = await getAllCredentials();
  const rp = getRelyingParty();

  const options = await generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: "preferred",
    allowCredentials: allCreds.map(c => ({
      id: c.credential_id,
      transports: c.transports || [],
    })),
  });

  const challengeId = storeChallengeData({
    challenge: options.challenge,
    type: "login",
  });

  return { options, challengeId };
}

export async function verifyAndCompleteLogin(challengeId, credential) {
  const challengeData = getChallengeData(challengeId);
  if (!challengeData || challengeData.type !== "login") {
    throw new Error("Challenge expired or invalid");
  }

  // Find the credential in DB
  const allCreds = await getAllCredentials();
  const dbCred = allCreds.find(c => c.credential_id === credential.id);
  if (!dbCred) throw new Error("Unknown credential");

  const rp = getRelyingParty();
  const verification = await verifyAuthenticationResponse({
    response: credential,
    expectedChallenge: challengeData.challenge,
    expectedOrigin: rp.origin,
    expectedRPID: rp.id,
    credential: {
      id: dbCred.credential_id,
      publicKey: Buffer.from(dbCred.public_key, "base64url"),
      counter: dbCred.counter,
      transports: dbCred.transports || [],
    },
  });

  if (!verification.verified) {
    throw new Error("Authentication verification failed");
  }

  // Update counter
  await updateCredentialCounter(
    dbCred.credential_id,
    verification.authenticationInfo.newCounter
  );

  // Look up user
  const { data: user, error } = await supabase()
    .from("admin_users")
    .select("id, username")
    .eq("id", dbCred.user_id)
    .single();
  if (error || !user) throw new Error("User not found");

  // Create session
  const session = await createSession(user.id);
  await cleanExpiredSessions();

  return { user, session };
}
```

**Note:** The imports at the top of the file need to be merged with the existing imports. The `@simplewebauthn/server` import should be added at the top of `auth.js` alongside the `node:crypto` import.

- [ ] **Step 2: Run existing tests still pass**

```bash
node --test --test-force-exit ./test/auth.test.js
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add auth.js
git commit -m "feat(auth): add WebAuthn registration and authentication flows"
```

---

### Task 5: webhook.js — Mount Cookie Parser & Auth Routes

**Files:**
- Modify: `webhook.js`

- [ ] **Step 1: Add cookie-parser import and middleware**

At the top of `webhook.js`, after the existing imports, add:

```javascript
import cookieParser from "cookie-parser";
```

After the `app.use(express.urlencoded(...))` line (~line 46), add:

```javascript
app.use(cookieParser());
```

- [ ] **Step 2: Add auth route imports**

At the top of `webhook.js`, add to imports:

```javascript
import { getAdminUserCount, generateBootstrapRegOptions, generateInviteRegOptions, verifyAndCompleteRegistration, generateLoginChallenge, verifyAndCompleteLogin, validateSession, destroySession, createInvite, getAdminUsers, getRelyingParty } from "./auth.js";
```

- [ ] **Step 3: Add the auth status endpoint (unauthenticated)**

Before the `verifyAdmin` function definition, add:

```javascript
// --- Auth routes (mounted under /api/admin/auth) ---

// Auth status — tells the frontend which login mode to show
app.get("/api/admin/auth/status", async (req, res) => {
  try {
    const count = await getAdminUserCount();
    res.json({ needsBootstrap: count === 0 });
  } catch {
    res.json({ needsBootstrap: false }); // fail closed
  }
});

// Auth me — check current session, return user info or 401
app.get("/api/admin/auth/me", async (req, res) => {
  const sessionToken = req.cookies?.admin_session;
  if (!sessionToken) return res.status(401).json({ error: "No session" });
  const user = await validateSession(sessionToken);
  if (!user) {
    res.clearCookie('admin_session', { path: '/api/admin' });
    return res.status(401).json({ error: "Session expired" });
  }
  res.json({ user: { id: user.id, username: user.username } });
});
```

- [ ] **Step 4: Add bootstrap endpoint**

```javascript
// Bootstrap — first user registration (requires ADMIN_SECRET)
app.post("/api/admin/auth/bootstrap", async (req, res) => {
  if (!rateLimit('auth-bootstrap:' + (req.ip || 'unknown'), 3)) {
    return res.status(429).json({ error: "Too many attempts" });
  }

  const bootstrapKey = req.headers['x-bootstrap-key'];
  const secret = process.env.ADMIN_SECRET;
  if (!secret || !bootstrapKey || !safeCompare(bootstrapKey, secret)) {
    return res.status(403).json({ error: "Invalid bootstrap key" });
  }

  const { username } = req.body;
  if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]{2,50}$/.test(username)) {
    return res.status(400).json({ error: "Username must be 2-50 chars (letters, numbers, _ -)" });
  }

  try {
    const { options, challengeId } = await generateBootstrapRegOptions(username.trim());
    res.json({ options, challengeId });
  } catch (err) {
    console.error("Bootstrap error:", err.message);
    res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 5: Add invite challenge endpoint**

```javascript
// Invite registration — get challenge (requires valid invite code)
app.post("/api/admin/auth/invite-challenge", async (req, res) => {
  if (!rateLimit('auth-invite:' + (req.ip || 'unknown'), 5)) {
    return res.status(429).json({ error: "Too many attempts" });
  }

  const { username, invite } = req.body;
  if (!username || typeof username !== 'string' || !/^[a-zA-Z0-9_-]{2,50}$/.test(username)) {
    return res.status(400).json({ error: "Username must be 2-50 chars (letters, numbers, _ -)" });
  }
  if (!invite) {
    return res.status(400).json({ error: "Invite code required" });
  }

  try {
    const { options, challengeId } = await generateInviteRegOptions(username.trim(), invite);
    res.json({ options, challengeId });
  } catch (err) {
    console.error("Invite challenge error:", err.message);
    res.status(400).json({ error: "Invalid or expired invite" });
  }
});
```

- [ ] **Step 6: Add register endpoint (completes both bootstrap and invite)**

```javascript
// Register — complete passkey registration
app.post("/api/admin/auth/register", async (req, res) => {
  if (!rateLimit('auth-register:' + (req.ip || 'unknown'), 5)) {
    return res.status(429).json({ error: "Too many attempts" });
  }

  const { challengeId, credential } = req.body;
  if (!challengeId || !credential) {
    return res.status(400).json({ error: "Missing challengeId or credential" });
  }

  try {
    const { user, session } = await verifyAndCompleteRegistration(challengeId, credential);
    res.cookie('admin_session', session.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/admin',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true, user: { username: user.username } });
  } catch (err) {
    console.error("Registration error:", err.message);
    res.status(400).json({ error: err.message });
  }
});
```

- [ ] **Step 7: Add login challenge and verify endpoints**

```javascript
// Login — get authentication challenge
app.post("/api/admin/auth/login-challenge", async (req, res) => {
  if (!rateLimit('auth-login:' + (req.ip || 'unknown'), 10)) {
    return res.status(429).json({ error: "Too many attempts" });
  }

  try {
    const { options, challengeId } = await generateLoginChallenge();
    res.json({ options, challengeId });
  } catch (err) {
    console.error("Login challenge error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Login — verify authentication
app.post("/api/admin/auth/login-verify", async (req, res) => {
  if (!rateLimit('auth-verify:' + (req.ip || 'unknown'), 10)) {
    return res.status(429).json({ error: "Too many attempts" });
  }

  const { challengeId, credential } = req.body;
  if (!challengeId || !credential) {
    return res.status(400).json({ error: "Missing challengeId or credential" });
  }

  try {
    const { user, session } = await verifyAndCompleteLogin(challengeId, credential);
    res.cookie('admin_session', session.token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      path: '/api/admin',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.json({ ok: true, user: { username: user.username } });
  } catch (err) {
    console.error("Login verify error:", err.message);
    res.status(401).json({ error: "Authentication failed" });
  }
});
```

- [ ] **Step 8: Add logout endpoint**

```javascript
// Logout — destroy session
app.post("/api/admin/auth/logout", async (req, res) => {
  const token = req.cookies?.admin_session;
  if (token) await destroySession(token);
  res.clearCookie('admin_session', { path: '/api/admin' });
  res.json({ ok: true });
});
```

- [ ] **Step 9: Add invite create and admin list endpoints (protected)**

```javascript
// Invite — generate invite code (requires auth)
app.post("/api/admin/auth/invite", verifyAdmin, async (req, res) => {
  if (!rateLimit('auth-invite-create:' + (req.ip || 'unknown'), 5)) {
    return res.status(429).json({ error: "Too many attempts" });
  }

  try {
    const { code, expiresAt } = await createInvite(req.adminUser.id);
    const baseUrl = process.env.WEBHOOK_BASE_URL || 'https://flatwhiteindex.com.au';
    const inviteUrl = `${baseUrl}/admin?invite=${encodeURIComponent(code)}`;
    res.json({ inviteCode: code, inviteUrl, expiresAt });
  } catch (err) {
    console.error("Invite create error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});

// List admins (requires auth)
app.get("/api/admin/auth/users", verifyAdmin, async (req, res) => {
  try {
    const users = await getAdminUsers();
    res.json(users);
  } catch (err) {
    console.error("List admins error:", err.message);
    res.status(500).json({ error: "Internal server error" });
  }
});
```

- [ ] **Step 10: Commit**

```bash
git add webhook.js
git commit -m "feat(auth): add passkey auth routes — bootstrap, login, register, invite"
```

---

### Task 6: webhook.js — Update verifyAdmin Middleware

**Files:**
- Modify: `webhook.js`

- [ ] **Step 1: Replace verifyAdmin with cookie-first auth**

Replace the existing `verifyAdmin` function:

```javascript
async function verifyAdmin(req, res, next) {
  // 1. Session cookie (primary — passkey auth)
  const sessionToken = req.cookies?.admin_session;
  if (sessionToken) {
    const user = await validateSession(sessionToken);
    if (user) {
      req.adminUser = user;
      return next();
    }
    // Expired/invalid session — clear cookie
    res.clearCookie('admin_session', { path: '/api/admin' });
  }

  // 2. Bearer token fallback (ADMIN_SECRET for CLI/API access)
  const secret = process.env.ADMIN_SECRET;
  if (secret) {
    const provided = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (provided && safeCompare(provided, secret)) {
      req.adminUser = { id: null, username: 'api-key' };
      return next();
    }
  }

  return res.status(401).json({ error: "Unauthorized" });
}
```

- [ ] **Step 2: Run full test suite**

```bash
npm test
```

Expected: 36/36 PASS (existing tests should still pass — they import `extractPrices` from webhook.js, not admin routes)

- [ ] **Step 3: Commit**

```bash
git add webhook.js
git commit -m "feat(auth): update verifyAdmin — session cookie primary, Bearer fallback"
```

---

### Task 7: Update admin.html — Passkey Login UI

**Files:**
- Modify: `public/admin.html`

- [ ] **Step 1: Add SimpleWebAuthn browser script to head**

Before the closing `</head>` tag, add:

```html
<script src="/vendor/simplewebauthn-browser.umd.min.js"></script>
```

This loads the local bundle from `public/vendor/` (downloaded in Task 2). No CSP changes needed since it's served from `'self'`.

- [ ] **Step 2: Replace the login page HTML**

Replace the existing `<div class="login-page" id="loginPage">...</div>` block with:

```html
<div class="login-page" id="loginPage">
  <div class="login-box">
    <h1>☕ Flat White Index</h1>

    <!-- Bootstrap mode (first user) -->
    <div id="bootstrapMode" style="display:none;">
      <p class="sub">No admins yet — register the first one.</p>
      <div class="login-error" id="bootstrapError"></div>
      <input type="text" id="bootstrapUsername" placeholder="Choose a username" autocomplete="username">
      <input type="password" id="bootstrapKey" placeholder="Admin secret (setup key)" autocomplete="off">
      <button onclick="doBootstrap()">Register with passkey</button>
    </div>

    <!-- Normal login -->
    <div id="loginMode" style="display:none;">
      <p class="sub">Sign in with your passkey.</p>
      <div class="login-error" id="loginError"></div>
      <button onclick="doPasskeyLogin()">Sign in with passkey</button>
    </div>

    <!-- Invite registration -->
    <div id="inviteMode" style="display:none;">
      <p class="sub">You've been invited — register your passkey.</p>
      <div class="login-error" id="inviteError"></div>
      <input type="text" id="inviteUsername" placeholder="Choose a username" autocomplete="username">
      <button onclick="doInviteRegister()">Register with passkey</button>
    </div>

    <!-- Legacy fallback -->
    <div id="legacyMode" style="display:none;">
      <p class="sub">Admin access — enter your secret key.</p>
      <div class="login-error" id="legacyError"></div>
      <form onsubmit="doLegacyLogin(event)">
        <input type="password" id="secretInput" placeholder="Admin secret" autocomplete="off">
        <button type="submit">Sign in with key</button>
      </form>
    </div>

    <div id="loginToggle" style="margin-top:1rem;text-align:center;">
      <a href="#" id="toggleLegacy" style="font-size:0.78rem;color:var(--text-dim);" onclick="event.preventDefault();toggleLegacyMode()">Use secret key instead</a>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Replace the auth JavaScript section**

Replace the `// --- AUTH ---` section (the `doLogin`, `verifyAndShow` functions) with:

```javascript
// --- AUTH ---
const { startRegistration, startAuthentication } = SimpleWebAuthnBrowser;
let currentUser = null;
const inviteCode = new URLSearchParams(window.location.search).get('invite');

// Determine login mode on load
(async function initAuth() {
  // Check for existing session via /auth/me
  try {
    const meRes = await fetch('/api/admin/auth/me', { credentials: 'same-origin' });
    if (meRes.ok) {
      const { user } = await meRes.json();
      currentUser = user;
      const statusRes = await api('/api/admin/status');
      if (statusRes.ok) {
        const data = await statusRes.json();
        document.getElementById('loginPage').classList.add('hidden');
        document.getElementById('app').classList.add('active');
        updateStats(data);
        startPolling();
        loadReviewCount();
        loadSuburbProgress();
        const sel = document.getElementById('suburbSelect');
        Object.entries(SUBURB_MAP).forEach(([k, v]) => { const o = document.createElement('option'); o.value = k; o.textContent = v; sel.appendChild(o); });
        return;
      }
    }
  } catch {}

  // No valid session — determine which mode
  if (inviteCode) {
    document.getElementById('inviteMode').style.display = '';
    document.getElementById('toggleLegacy').style.display = 'none';
    return;
  }

  try {
    const res = await fetch('/api/admin/auth/status');
    const { needsBootstrap } = await res.json();
    if (needsBootstrap) {
      document.getElementById('bootstrapMode').style.display = '';
      document.getElementById('toggleLegacy').style.display = 'none';
    } else {
      document.getElementById('loginMode').style.display = '';
    }
  } catch {
    // Fallback to legacy if auth endpoints fail
    document.getElementById('legacyMode').style.display = '';
    document.getElementById('toggleLegacy').style.display = 'none';
  }
})();

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}

async function doBootstrap() {
  const username = document.getElementById('bootstrapUsername').value.trim();
  const key = document.getElementById('bootstrapKey').value.trim();
  if (!username || !key) return showError('bootstrapError', 'Username and setup key required.');

  try {
    const chalRes = await fetch('/api/admin/auth/bootstrap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Bootstrap-Key': key },
      body: JSON.stringify({ username }),
      credentials: 'same-origin',
    });
    if (!chalRes.ok) {
      const err = await chalRes.json();
      return showError('bootstrapError', err.error || 'Bootstrap failed.');
    }
    const { options, challengeId } = await chalRes.json();

    const credential = await startRegistration({ optionsJSON: options });

    const regRes = await fetch('/api/admin/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, credential }),
      credentials: 'same-origin',
    });
    if (!regRes.ok) {
      const err = await regRes.json();
      return showError('bootstrapError', err.error || 'Registration failed.');
    }
    window.location.reload();
  } catch (err) {
    showError('bootstrapError', err.message || 'Passkey registration failed.');
  }
}

async function doPasskeyLogin() {
  try {
    document.getElementById('loginError').style.display = 'none';
    const chalRes = await fetch('/api/admin/auth/login-challenge', { method: 'POST', credentials: 'same-origin' });
    if (!chalRes.ok) return showError('loginError', 'Could not start login.');
    const { options, challengeId } = await chalRes.json();

    const credential = await startAuthentication({ optionsJSON: options });

    const verRes = await fetch('/api/admin/auth/login-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, credential }),
      credentials: 'same-origin',
    });
    if (!verRes.ok) {
      const err = await verRes.json();
      return showError('loginError', err.error || 'Login failed.');
    }
    window.location.reload();
  } catch (err) {
    showError('loginError', err.message || 'Passkey authentication failed.');
  }
}

async function doInviteRegister() {
  const username = document.getElementById('inviteUsername').value.trim();
  if (!username) return showError('inviteError', 'Username required.');

  try {
    const chalRes = await fetch('/api/admin/auth/invite-challenge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, invite: inviteCode }),
      credentials: 'same-origin',
    });
    if (!chalRes.ok) {
      const err = await chalRes.json();
      return showError('inviteError', err.error || 'Invite invalid or expired.');
    }
    const { options, challengeId } = await chalRes.json();

    const credential = await startRegistration({ optionsJSON: options });

    const regRes = await fetch('/api/admin/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, credential }),
      credentials: 'same-origin',
    });
    if (!regRes.ok) {
      const err = await regRes.json();
      return showError('inviteError', err.error || 'Registration failed.');
    }
    // Clear invite param and reload
    window.location.href = '/admin';
  } catch (err) {
    showError('inviteError', err.message || 'Passkey registration failed.');
  }
}

// Legacy login (ADMIN_SECRET Bearer token fallback)
let token = sessionStorage.getItem('admin_token') || '';
async function doLegacyLogin(e) {
  e.preventDefault();
  token = document.getElementById('secretInput').value.trim();
  if (!token) return;
  const res = await fetch('/api/admin/status', { headers: { 'Authorization': 'Bearer ' + token } });
  if (!res.ok) {
    showError('legacyError', 'Invalid key. Try again.');
    token = '';
    return;
  }
  sessionStorage.setItem('admin_token', token);
  window.location.reload();
}

function toggleLegacyMode() {
  document.getElementById('loginMode').style.display = 'none';
  document.getElementById('legacyMode').style.display = '';
  document.getElementById('toggleLegacy').textContent = 'Use passkey instead';
  document.getElementById('toggleLegacy').onclick = (e) => {
    e.preventDefault();
    document.getElementById('legacyMode').style.display = 'none';
    document.getElementById('loginMode').style.display = '';
    document.getElementById('toggleLegacy').textContent = 'Use secret key instead';
    document.getElementById('toggleLegacy').onclick = (e2) => { e2.preventDefault(); toggleLegacyMode(); };
  };
}
```

- [ ] **Step 4: Update the `api()` helper to use cookies + Bearer fallback**

Replace the existing `api()` function:

```javascript
function api(url, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  // If we have a legacy token, include it as Bearer (fallback)
  if (token) headers['Authorization'] = 'Bearer ' + token;
  return fetch(url, { ...opts, headers, credentials: 'same-origin' });
}
```

- [ ] **Step 5: Add invite and admin list UI to the System tab**

In the system tab panel (`<div class="tab-panel" id="panel-system">`), add before the closing `</div>`:

```html
      <div class="panel" style="margin-top:1rem;">
        <div class="panel-head"><h2>Admin Users</h2><button class="btn btn-sm btn-primary" onclick="createInvite()">+ Invite Admin</button></div>
        <div class="panel-body" id="sysAdmins"><div class="empty">Loading...</div></div>
      </div>
      <div id="inviteModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:100;display:none;align-items:center;justify-content:center;">
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:12px;padding:2rem;max-width:480px;width:90%;">
          <h3 style="margin-bottom:1rem;color:var(--cream);">Invite Link</h3>
          <p style="font-size:0.82rem;color:var(--text-dim);margin-bottom:0.5rem;">Share this link — expires in 24 hours, single use.</p>
          <input id="inviteLinkInput" readonly style="width:100%;padding:0.6rem;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:var(--cream);font-size:0.82rem;margin-bottom:1rem;">
          <div style="display:flex;gap:0.5rem;">
            <button class="btn btn-primary" onclick="copyInvite()">Copy</button>
            <button class="btn btn-ghost" onclick="document.getElementById('inviteModal').style.display='none'">Close</button>
          </div>
        </div>
      </div>
```

- [ ] **Step 6: Add the invite and admin list JavaScript**

Add to the script section:

```javascript
async function createInvite() {
  try {
    const res = await api('/api/admin/auth/invite', { method: 'POST' });
    if (!res.ok) return log('Failed to create invite', 'e');
    const { inviteUrl } = await res.json();
    document.getElementById('inviteLinkInput').value = inviteUrl;
    document.getElementById('inviteModal').style.display = 'flex';
  } catch (err) {
    log('Invite error: ' + err.message, 'e');
  }
}

function copyInvite() {
  const input = document.getElementById('inviteLinkInput');
  navigator.clipboard.writeText(input.value);
  log('Invite link copied!', 's');
}

async function loadAdminUsers() {
  try {
    const res = await api('/api/admin/auth/users');
    if (!res.ok) return;
    const users = await res.json();
    document.getElementById('sysAdmins').innerHTML = users.map(u =>
      `<div class="sys-item">
        <span class="label">${esc(u.username)}</span>
        <span class="val">${u.admin_credentials?.length || 0} passkey(s) — joined ${timeAgo(u.created_at)}</span>
      </div>`
    ).join('') || '<div class="empty">No admins</div>';
  } catch {}
}
```

Then, inside the existing `loadSystem()` function body (at the end, before the catch), add:

```javascript
    await loadAdminUsers();
```

- [ ] **Step 7: Add a logout button to the topbar**

In the `<div class="topbar-right">` section, add before the server-dot:

```html
<button class="btn btn-sm btn-ghost" id="logoutBtn" onclick="doLogout()" style="font-size:0.78rem;">Logout</button>
```

Add the logout function:

```javascript
async function doLogout() {
  await fetch('/api/admin/auth/logout', { method: 'POST', credentials: 'same-origin' });
  sessionStorage.removeItem('admin_token');
  token = '';
  window.location.reload();
}
```

- [ ] **Step 8: Run full test suite**

```bash
npm test
```

Expected: 36/36 PASS

- [ ] **Step 9: Commit**

```bash
git add public/admin.html
git commit -m "feat(auth): passkey login UI — bootstrap, login, invite, legacy fallback"
```

---

### Task 8: Update env.example and package.json test script

**Files:**
- Modify: `env.example`
- Modify: `package.json`

- [ ] **Step 1: Add WebAuthn env vars to env.example**

After the `ADMIN_SECRET=` line, add:

```
# WebAuthn — Passkey auth (optional, auto-derived from WEBHOOK_BASE_URL)
# WEBAUTHN_RP_ID=flatwhiteindex.com.au
# WEBAUTHN_ORIGIN=https://flatwhiteindex.com.au
```

- [ ] **Step 2: Add auth test to package.json test script**

Update the `test` script in `package.json` to include `./test/auth.test.js`:

```json
"test": "node --test --test-force-exit ./test/webhook.test.js ./test/cafes.test.js ./test/caller.test.js ./test/index.test.js ./test/auth.test.js"
```

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests PASS (36 existing + new auth tests)

- [ ] **Step 4: Commit**

```bash
git add env.example package.json
git commit -m "chore(auth): update env.example and test script for passkey auth"
```

---

### Task 9: Manual Integration Test

No automated test — this requires a real browser with WebAuthn support.

- [ ] **Step 1: Run migration 006 in Supabase**

Copy `specs/migrations/006-admin-passkeys.sql` and run in Supabase SQL Editor.

- [ ] **Step 2: Start the server**

```bash
node webhook.js
```

- [ ] **Step 3: Test bootstrap flow**

1. Open `https://flatwhiteindex.com.au/admin` (or localhost)
2. Should see "No admins yet — register the first one"
3. Enter username + ADMIN_SECRET → click "Register with passkey"
4. Touch authenticator → should redirect to admin panel

- [ ] **Step 4: Test logout and login**

1. Click Logout button
2. Should see "Sign in with passkey" button
3. Click → touch authenticator → should be logged in

- [ ] **Step 5: Test invite flow**

1. Go to System tab → click "Invite Admin"
2. Copy the invite link
3. Open in incognito/new browser
4. Enter username → click "Register with passkey"
5. Should be logged in as new admin

- [ ] **Step 6: Test legacy fallback**

1. Logout → click "Use secret key instead"
2. Enter ADMIN_SECRET → should log in via Bearer token

- [ ] **Step 7: Test API Bearer fallback**

```bash
curl -H "Authorization: Bearer YOUR_ADMIN_SECRET" https://flatwhiteindex.com.au/api/admin/status
```

Should return status JSON.

- [ ] **Step 8: Commit any fixes from manual testing**

```bash
git add -A
git commit -m "fix(auth): post-integration-test fixes"
```
