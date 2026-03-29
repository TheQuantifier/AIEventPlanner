import crypto from "node:crypto";
import { appConfig } from "./config/env.js";
import { query } from "./db.js";
import { sendEmail } from "./email-client.js";

const SESSION_TTL_DAYS = 30;
const RESET_TTL_MINUTES = 30;
const PASSWORD_MIN_LENGTH = 12;

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

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
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
      from app_users
      where username = $1
         or lower(email) = $2
      limit 1
    `,
    [normalizedUsername, normalizedEmail]
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
      returning id, username, email, full_name, created_at
    `,
    [userId, username, normalizedEmail, normalizedFullName, passwordHash]
  );

  return {
    user: sanitizeUser(result.rows[0])
  };
}

export async function createSessionForCredentials({ identifier, email, username, password }) {
  const user = await loadUserByIdentifier(identifier || email || username);

  if (!user || !verifyPassword(password, user.password_hash)) {
    return {
      error: "Invalid email/username or password"
    };
  }

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
