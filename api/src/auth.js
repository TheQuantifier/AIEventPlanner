import crypto from "node:crypto";
import { appConfig } from "./config/env.js";
import { query } from "./db.js";
import { sendEmail } from "./email-client.js";

const SESSION_TTL_DAYS = 30;
const RESET_TTL_MINUTES = 30;
const ACCOUNT_ACTION_CODE_TTL_MINUTES = 15;
const PASSWORD_MIN_LENGTH = 8;
const OAUTH_STATE_TTL_MINUTES = 15;

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeFullName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizeOrganization(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function trim(value) {
  return String(value || "").trim();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derivedKey = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derivedKey}`;
}

function verifyPassword(password, passwordHash) {
  const [salt, expectedHash] = String(passwordHash || "").split(":");

  if (!salt || !expectedHash) {
    return false;
  }

  const actualHash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actualHash, "hex"), Buffer.from(expectedHash, "hex"));
}

function validateUsername(username) {
  return /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/.test(username);
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePassword(password) {
  const value = String(password || "");

  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }

  const checks = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value)
  ];

  if (checks.some((result) => !result)) {
    return "Password must include lowercase, uppercase, number, and symbol characters";
  }

  return "";
}

function slugifyFullName(fullName) {
  const base = normalizeFullName(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .replace(/\.{2,}/g, ".");

  return base || `user.${Math.random().toString(36).slice(2, 8)}`;
}

async function generateUniqueUsername(fullName) {
  const base = slugifyFullName(fullName).slice(0, 24);
  const candidates = [base];

  for (let index = 2; index <= 50; index += 1) {
    candidates.push(`${base}.${index}`.slice(0, 32));
  }

  const existing = await query("select username from app_users where username = any($1::text[])", [candidates]);
  const taken = new Set(existing.rows.map((row) => row.username));
  const candidate = candidates.find((value) => validateUsername(value) && !taken.has(value));

  if (candidate) {
    return candidate;
  }

  return `${base.slice(0, 20)}.${crypto.randomBytes(2).toString("hex")}`.slice(0, 32);
}

function sanitizeUser(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    email: row.email || "",
    fullName: row.full_name || "",
    organization: row.organization || "",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

async function loadUserByIdentifier(identifier) {
  const normalizedIdentifier = String(identifier || "").trim();
  const normalizedEmail = normalizeEmail(normalizedIdentifier);
  const normalizedUsername = normalizeUsername(normalizedIdentifier);

  const result = await query(
    `
      select id, username, email, full_name, password_hash, created_at
           , organization
      from app_users
      where username = $1
         or lower(email) = $2
      limit 1
    `,
    [normalizedUsername, normalizedEmail]
  );

  return result.rows[0] || null;
}

async function loadUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  const result = await query(
    `
      select id, username, email, full_name, password_hash, created_at
           , organization
      from app_users
      where lower(email) = $1
      limit 1
    `,
    [normalizedEmail]
  );

  return result.rows[0] || null;
}

async function createSessionForUser(user) {
  const token = crypto.randomBytes(32).toString("hex");
  const sessionId = createId("session");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  await query(
    `
      insert into app_sessions (id, user_id, token_hash, expires_at)
      values ($1, $2, $3, $4::timestamptz)
    `,
    [sessionId, user.id, hashToken(token), expiresAt]
  );

  return {
    token,
    user: sanitizeUser(user)
  };
}

function normalizeOAuthProvider(provider) {
  const normalized = trim(provider).toLowerCase();
  if (!["google", "microsoft"].includes(normalized)) {
    throw new Error("Unsupported sign-in provider");
  }
  return normalized;
}

function buildOAuthStateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function requireOAuthConfigured(provider) {
  if (provider === "google") {
    if (!trim(appConfig.calendar.auth.google.clientId) || !trim(appConfig.calendar.auth.google.clientSecret) || !trim(appConfig.calendar.auth.google.redirectUri)) {
      throw new Error("Google sign-in is not configured");
    }
  }

  if (provider === "microsoft") {
    if (!trim(appConfig.calendar.auth.microsoft.clientId) || !trim(appConfig.calendar.auth.microsoft.clientSecret) || !trim(appConfig.calendar.auth.microsoft.redirectUri)) {
      throw new Error("Microsoft sign-in is not configured");
    }
  }
}

async function storeOAuthState({ provider, state }) {
  const stateId = createId("auth-state");
  const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MINUTES * 60 * 1000).toISOString();

  await query(
    `
      insert into app_auth_oauth_states (id, provider, state, expires_at)
      values ($1, $2, $3, $4::timestamptz)
    `,
    [stateId, provider, state, expiresAt]
  );
}

async function consumeOAuthState({ provider, state }) {
  const result = await query(
    `
      select id
      from app_auth_oauth_states
      where provider = $1
        and state = $2
        and expires_at > now()
      limit 1
    `,
    [provider, state]
  );
  const record = result.rows[0];

  if (!record) {
    return false;
  }

  await query("delete from app_auth_oauth_states where id = $1", [record.id]);
  return true;
}

async function exchangeGoogleAuthCode(code) {
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", appConfig.calendar.auth.google.clientId);
  params.set("client_secret", appConfig.calendar.auth.google.clientSecret);
  params.set("redirect_uri", appConfig.calendar.auth.google.redirectUri);
  params.set("grant_type", "authorization_code");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google sign-in token exchange failed");
  }

  return payload;
}

async function exchangeMicrosoftAuthCode(code) {
  const tenant = trim(appConfig.calendar.auth.microsoft.tenant || "common");
  const params = new URLSearchParams();
  params.set("client_id", appConfig.calendar.auth.microsoft.clientId);
  params.set("client_secret", appConfig.calendar.auth.microsoft.clientSecret);
  params.set("redirect_uri", appConfig.calendar.auth.microsoft.redirectUri);
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("scope", "openid profile email User.Read");

  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Microsoft sign-in token exchange failed");
  }

  return payload;
}

async function fetchGoogleOAuthProfile(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || "Failed to fetch Google profile");
  }

  return {
    providerAccountId: payload.sub || payload.id || payload.email,
    email: payload.email,
    fullName: payload.name || payload.given_name || payload.email,
    avatarUrl: payload.picture || "",
    emailVerified: Boolean(payload.email_verified)
  };
}

async function fetchMicrosoftOAuthProfile(accessToken) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "Failed to fetch Microsoft profile");
  }

  return {
    providerAccountId: payload.id || payload.userPrincipalName || payload.mail,
    email: payload.mail || payload.userPrincipalName || "",
    fullName: payload.displayName || payload.givenName || payload.userPrincipalName || payload.mail,
    avatarUrl: "",
    emailVerified: Boolean(payload.mail || payload.userPrincipalName)
  };
}

async function loadProviderAccount(provider, providerAccountId) {
  const result = await query(
    `
      select pa.user_id
           , u.id, u.username, u.email, u.full_name, u.password_hash, u.created_at, u.organization
      from app_auth_provider_accounts pa
      join app_users u on u.id = pa.user_id
      where pa.provider = $1
        and pa.provider_account_id = $2
      limit 1
    `,
    [provider, providerAccountId]
  );

  return result.rows[0] || null;
}

async function upsertProviderAccount({ userId, provider, providerAccountId, email, fullName, avatarUrl }) {
  await query(
    `
      insert into app_auth_provider_accounts (
        id, user_id, provider, provider_account_id, email, full_name, avatar_url
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      on conflict (provider, provider_account_id)
      do update set
        user_id = excluded.user_id,
        email = excluded.email,
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url,
        updated_at = now()
    `,
    [createId("auth-provider"), userId, provider, providerAccountId, email || null, fullName || null, avatarUrl || null]
  );
}

async function createUserForOAuthProfile({ email, fullName }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedFullName = normalizeFullName(fullName || email);

  if (!validateEmail(normalizedEmail)) {
    throw new Error("OAuth provider did not return a valid email address");
  }

  const userId = createId("user");
  const username = await generateUniqueUsername(normalizedFullName);
  const result = await query(
    `
      insert into app_users (id, username, email, full_name, password_hash)
      values ($1, $2, $3, $4, null)
      returning id, username, email, full_name, organization, created_at
    `,
    [userId, username, normalizedEmail, normalizedFullName]
  );

  return result.rows[0];
}

async function resolveUserForOAuthProfile({ provider, providerAccountId, email, fullName, avatarUrl }) {
  const linked = await loadProviderAccount(provider, providerAccountId);
  if (linked) {
    await upsertProviderAccount({
      userId: linked.id,
      provider,
      providerAccountId,
      email,
      fullName,
      avatarUrl
    });
    return linked;
  }

  const normalizedEmail = normalizeEmail(email);
  let user = normalizedEmail ? await loadUserByEmail(normalizedEmail) : null;

  if (!user) {
    user = await createUserForOAuthProfile({ email: normalizedEmail, fullName });
  }

  await upsertProviderAccount({
    userId: user.id,
    provider,
    providerAccountId,
    email: normalizedEmail,
    fullName,
    avatarUrl
  });

  return user;
}

function buildResetLink(token) {
  const baseUrl = String(appConfig.app.webBaseUrl || "").replace(/\/+$/, "");
  return baseUrl ? `${baseUrl}/?resetToken=${encodeURIComponent(token)}` : "";
}

async function sendPasswordResetEmail({ email, fullName, token }) {
  const resetLink = buildResetLink(token);
  const greeting = fullName || "there";

  await sendEmail({
    to: email,
    subject: "Reset your AI Event Planner password",
    text: [
      `Hello ${greeting},`,
      "",
      "We received a request to reset your password.",
      resetLink ? `Use this link to choose a new password: ${resetLink}` : "Use the reset token below to choose a new password in the app:",
      resetLink ? "" : `Reset token: ${token}`,
      "",
      `This link expires in ${RESET_TTL_MINUTES} minutes.`,
      "If you did not request this reset, you can ignore this email."
    ].join("\n")
  });
}

function createVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendAccountActionCodeEmail({ email, fullName, purpose, code }) {
  const greeting = fullName || "there";
  const subject = purpose === "delete-account"
    ? "Confirm your AI Event Planner account deletion"
    : "Confirm your AI Event Planner password change";
  const actionLine = purpose === "delete-account"
    ? "We received a request to permanently delete your account."
    : "We received a request to change your password.";

  await sendEmail({
    to: email,
    subject,
    text: [
      `Hello ${greeting},`,
      "",
      actionLine,
      `Use this verification code to continue: ${code}`,
      "",
      `This code expires in ${ACCOUNT_ACTION_CODE_TTL_MINUTES} minutes.`,
      "If you did not request this change, you can ignore this email."
    ].join("\n")
  });
}

async function createAccountActionCode({ userId, purpose, payload = {} }) {
  const code = createVerificationCode();
  const recordId = createId("acct-code");
  const expiresAt = new Date(Date.now() + ACCOUNT_ACTION_CODE_TTL_MINUTES * 60 * 1000).toISOString();

  await query("delete from app_account_action_codes where user_id = $1 and purpose = $2 and used_at is null", [userId, purpose]);
  await query(
    `
      insert into app_account_action_codes (id, user_id, purpose, code_hash, payload, expires_at)
      values ($1, $2, $3, $4, $5::jsonb, $6::timestamptz)
    `,
    [recordId, userId, purpose, hashToken(code), JSON.stringify(payload), expiresAt]
  );

  return code;
}

async function consumeAccountActionCode({ userId, purpose, code }) {
  const normalizedCode = String(code || "").trim();

  if (!normalizedCode) {
    return null;
  }

  const result = await query(
    `
      select id, payload
      from app_account_action_codes
      where user_id = $1
        and purpose = $2
        and code_hash = $3
        and used_at is null
        and expires_at > now()
      order by created_at desc
      limit 1
    `,
    [userId, purpose, hashToken(normalizedCode)]
  );
  const record = result.rows[0];

  if (!record) {
    return null;
  }

  await query("update app_account_action_codes set used_at = now() where id = $1", [record.id]);
  return record.payload || {};
}

export async function registerUser({ email, fullName, password }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedFullName = normalizeFullName(fullName);
  const passwordError = validatePassword(password);

  if (!normalizedFullName || normalizedFullName.length < 3) {
    return {
      error: "Full name must be at least 3 characters"
    };
  }

  if (!validateEmail(normalizedEmail)) {
    return {
      error: "Enter a valid email address"
    };
  }

  if (passwordError) {
    return {
      error: passwordError
    };
  }

  const existing = await query("select id from app_users where lower(email) = $1 limit 1", [normalizedEmail]);
  if (existing.rows[0]) {
    return {
      error: "An account with that email already exists"
    };
  }

  const userId = createId("user");
  const username = await generateUniqueUsername(normalizedFullName);
  const passwordHash = hashPassword(password);
  const result = await query(
    `
      insert into app_users (id, username, email, full_name, password_hash)
      values ($1, $2, $3, $4, $5)
      returning id, username, email, full_name, organization, created_at
    `,
    [userId, username, normalizedEmail, normalizedFullName, passwordHash]
  );

  return {
    user: sanitizeUser(result.rows[0])
  };
}

export async function createSessionForCredentials({ identifier, email, username, password }) {
  const user = await loadUserByIdentifier(identifier || email || username);

  if (!user) {
    return {
      error: "Incorrect email/username or password"
    };
  }

  if (!user.password_hash) {
    return {
      error: "This account uses Google or Microsoft sign-in. Continue with that provider or set a password from account settings after signing in."
    };
  }

  if (!verifyPassword(password, user.password_hash)) {
    return {
      error: "Incorrect email/username or password"
    };
  }

  return createSessionForUser(user);
}

export async function createOAuthAuthUrl(provider) {
  const resolvedProvider = normalizeOAuthProvider(provider);
  requireOAuthConfigured(resolvedProvider);

  const state = buildOAuthStateToken();
  await storeOAuthState({ provider: resolvedProvider, state });

  if (resolvedProvider === "google") {
    const params = new URLSearchParams();
    params.set("client_id", appConfig.calendar.auth.google.clientId);
    params.set("redirect_uri", appConfig.calendar.auth.google.redirectUri);
    params.set("response_type", "code");
    params.set("scope", "openid email profile");
    params.set("state", state);
    params.set("include_granted_scopes", "true");
    params.set("prompt", "select_account");

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  const tenant = trim(appConfig.calendar.auth.microsoft.tenant || "common");
  const params = new URLSearchParams();
  params.set("client_id", appConfig.calendar.auth.microsoft.clientId);
  params.set("redirect_uri", appConfig.calendar.auth.microsoft.redirectUri);
  params.set("response_type", "code");
  params.set("response_mode", "query");
  params.set("scope", "openid profile email User.Read");
  params.set("state", state);
  params.set("prompt", "select_account");

  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function createSessionForOAuthCallback({ provider, code, state }) {
  const resolvedProvider = normalizeOAuthProvider(provider);
  requireOAuthConfigured(resolvedProvider);

  const validState = await consumeOAuthState({ provider: resolvedProvider, state });
  if (!validState) {
    throw new Error("Sign-in authorization has expired or is invalid");
  }

  const profile = resolvedProvider === "google"
    ? await fetchGoogleOAuthProfile((await exchangeGoogleAuthCode(code)).access_token)
    : await fetchMicrosoftOAuthProfile((await exchangeMicrosoftAuthCode(code)).access_token);

  if (!profile.providerAccountId) {
    throw new Error("OAuth provider did not return an account identifier");
  }

  if (!profile.email || !profile.emailVerified) {
    throw new Error("OAuth provider did not return a verified email address");
  }

  const user = await resolveUserForOAuthProfile({
    provider: resolvedProvider,
    providerAccountId: profile.providerAccountId,
    email: profile.email,
    fullName: profile.fullName,
    avatarUrl: profile.avatarUrl
  });

  return createSessionForUser(user);
}

export async function getUserFromToken(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return null;
  }

  const result = await query(
    `
      select u.id, u.username, u.email, u.full_name, u.created_at
           , u.organization
      from app_sessions s
      join app_users u on u.id = s.user_id
      where s.token_hash = $1
        and s.expires_at > now()
      limit 1
    `,
    [hashToken(normalizedToken)]
  );

  return sanitizeUser(result.rows[0]);
}

export async function revokeSession(token) {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return;
  }

  await query("delete from app_sessions where token_hash = $1", [hashToken(normalizedToken)]);
}

export async function requestPasswordReset({ email }) {
  const normalizedEmail = normalizeEmail(email);

  if (!validateEmail(normalizedEmail)) {
    return {
      error: "Enter a valid email address"
    };
  }

  const result = await query(
    `
      select id, username, email, full_name, created_at
           , organization
      from app_users
      where lower(email) = $1
      limit 1
    `,
    [normalizedEmail]
  );
  const user = result.rows[0];

  if (!user) {
    return {
      ok: true
    };
  }

  const token = crypto.randomBytes(32).toString("hex");
  const resetId = createId("reset");
  const expiresAt = new Date(Date.now() + RESET_TTL_MINUTES * 60 * 1000).toISOString();

  await query("delete from app_password_resets where user_id = $1 and used_at is null", [user.id]);
  await query(
    `
      insert into app_password_resets (id, user_id, token_hash, expires_at)
      values ($1, $2, $3, $4::timestamptz)
    `,
    [resetId, user.id, hashToken(token), expiresAt]
  );

  await sendPasswordResetEmail({
    email: user.email,
    fullName: user.full_name,
    token
  });

  return {
    ok: true
  };
}

export async function resetPassword({ token, password }) {
  const passwordError = validatePassword(password);
  if (passwordError) {
    return {
      error: passwordError
    };
  }

  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    return {
      error: "Reset token is required"
    };
  }

  const result = await query(
    `
      select r.id, r.user_id
      from app_password_resets r
      where r.token_hash = $1
        and r.used_at is null
        and r.expires_at > now()
      limit 1
    `,
    [hashToken(normalizedToken)]
  );
  const resetRecord = result.rows[0];

  if (!resetRecord) {
    return {
      error: "Reset link is invalid or expired"
    };
  }

  await query("update app_users set password_hash = $1, updated_at = now() where id = $2", [hashPassword(password), resetRecord.user_id]);
  await query("update app_password_resets set used_at = now() where id = $1", [resetRecord.id]);
  await query("delete from app_sessions where user_id = $1", [resetRecord.user_id]);

  return {
    ok: true
  };
}

export async function updateUserProfile(userId, { fullName, email, organization }) {
  const normalizedFullName = normalizeFullName(fullName);
  const normalizedEmail = normalizeEmail(email);
  const normalizedOrganization = normalizeOrganization(organization);

  if (!normalizedFullName || normalizedFullName.length < 3) {
    return {
      error: "Full name must be at least 3 characters"
    };
  }

  if (!validateEmail(normalizedEmail)) {
    return {
      error: "Enter a valid email address"
    };
  }

  const existing = await query("select id from app_users where lower(email) = $1 and id <> $2 limit 1", [normalizedEmail, userId]);
  if (existing.rows[0]) {
    return {
      error: "That email address is already in use"
    };
  }

  const result = await query(
    `
      update app_users
      set email = $1,
          full_name = $2,
          organization = $3,
          updated_at = now()
      where id = $4
      returning id, username, email, full_name, organization, created_at
    `,
    [normalizedEmail, normalizedFullName, normalizedOrganization, userId]
  );

  return {
    user: sanitizeUser(result.rows[0])
  };
}

export async function requestPasswordChangeVerification(userId, { newPassword }) {
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    return {
      error: passwordError
    };
  }

  const result = await query(
    `
      select id, email, full_name
      from app_users
      where id = $1
      limit 1
    `,
    [userId]
  );
  const user = result.rows[0];

  if (!user?.email) {
    return {
      error: "No email address is available for this account"
    };
  }

  const code = await createAccountActionCode({
    userId,
    purpose: "change-password",
    payload: {
      passwordHash: hashPassword(newPassword)
    }
  });

  await sendAccountActionCodeEmail({
    email: user.email,
    fullName: user.full_name,
    purpose: "change-password",
    code
  });

  return {
    ok: true
  };
}

export async function confirmPasswordChange(userId, { code }) {
  const payload = await consumeAccountActionCode({
    userId,
    purpose: "change-password",
    code
  });

  if (!payload?.passwordHash) {
    return {
      error: "Verification code is invalid or expired"
    };
  }

  await query("update app_users set password_hash = $1, updated_at = now() where id = $2", [payload.passwordHash, userId]);
  await query("delete from app_sessions where user_id = $1", [userId]);

  return {
    ok: true
  };
}

export async function requestAccountDeletionVerification(userId) {
  const result = await query(
    `
      select id, email, full_name
      from app_users
      where id = $1
      limit 1
    `,
    [userId]
  );
  const user = result.rows[0];

  if (!user?.email) {
    return {
      error: "No email address is available for this account"
    };
  }

  const code = await createAccountActionCode({
    userId,
    purpose: "delete-account"
  });

  await sendAccountActionCodeEmail({
    email: user.email,
    fullName: user.full_name,
    purpose: "delete-account",
    code
  });

  return {
    ok: true
  };
}

export async function confirmAccountDeletion(userId, { code }) {
  const payload = await consumeAccountActionCode({
    userId,
    purpose: "delete-account",
    code
  });

  if (!payload) {
    return {
      error: "Verification code is invalid or expired"
    };
  }

  await query("delete from app_users where id = $1", [userId]);

  return {
    ok: true
  };
}
