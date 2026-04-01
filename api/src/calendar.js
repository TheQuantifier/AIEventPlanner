import crypto from "node:crypto";
import { appConfig } from "./config/env.js";
import { query } from "./db.js";

const AUTH_STATE_TTL_MINUTES = 15;
const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function trim(value) {
  return String(value || "").trim();
}

function nowIso() {
  return new Date().toISOString();
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function buildStateToken() {
  return crypto.randomBytes(24).toString("hex");
}

function normalizeProvider(provider) {
  return String(provider || "").trim().toLowerCase();
}

function requireProvider(provider) {
  const normalized = normalizeProvider(provider);
  if (!normalized || !["google", "microsoft"].includes(normalized)) {
    throw new Error("Unsupported calendar provider");
  }
  return normalized;
}

function requireConfigured(provider) {
  if (provider === "google") {
    if (!trim(appConfig.calendar.google.clientId) || !trim(appConfig.calendar.google.clientSecret) || !trim(appConfig.calendar.google.redirectUri)) {
      throw new Error("Google calendar integration is not configured");
    }
  }

  if (provider === "microsoft") {
    if (!trim(appConfig.calendar.microsoft.clientId) || !trim(appConfig.calendar.microsoft.clientSecret) || !trim(appConfig.calendar.microsoft.redirectUri)) {
      throw new Error("Microsoft calendar integration is not configured");
    }
  }
}

function isoFrom(value, fallback) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return fallback;
  }
  return parsed.toISOString();
}

function toDate(value) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mergeBusyBlocks(blocks) {
  const sorted = [...blocks]
    .filter((block) => block.start && block.end)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const merged = [];
  for (const block of sorted) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push({ ...block });
      continue;
    }

    const lastEnd = new Date(last.end).getTime();
    const currentStart = new Date(block.start).getTime();
    if (currentStart <= lastEnd) {
      const currentEnd = new Date(block.end).getTime();
      if (currentEnd > lastEnd) {
        last.end = new Date(currentEnd).toISOString();
      }
      continue;
    }

    merged.push({ ...block });
  }

  return merged;
}

function deriveFreeBlocks(busyBlocks, start, end) {
  const free = [];
  let cursor = new Date(start).getTime();
  const endTime = new Date(end).getTime();

  for (const block of busyBlocks) {
    const blockStart = new Date(block.start).getTime();
    const blockEnd = new Date(block.end).getTime();
    if (blockStart > cursor) {
      free.push({ start: new Date(cursor).toISOString(), end: new Date(blockStart).toISOString() });
    }
    cursor = Math.max(cursor, blockEnd);
  }

  if (cursor < endTime) {
    free.push({ start: new Date(cursor).toISOString(), end: new Date(endTime).toISOString() });
  }

  return free;
}

async function storeAuthState({ userId, provider, state }) {
  const id = createId("cal-state");
  const expiresAt = addMinutes(new Date(), AUTH_STATE_TTL_MINUTES).toISOString();
  await query(
    "insert into calendar_auth_states (id, user_id, provider, state, expires_at) values ($1, $2, $3, $4, $5::timestamptz)",
    [id, userId, provider, state, expiresAt]
  );
  return { id, expiresAt };
}

async function consumeAuthState(state) {
  const result = await query(
    `
      select id, user_id, provider
      from calendar_auth_states
      where state = $1
        and expires_at > now()
      limit 1
    `,
    [state]
  );
  const record = result.rows[0];
  if (!record) {
    return null;
  }
  await query("delete from calendar_auth_states where id = $1", [record.id]);
  return record;
}

async function upsertCalendarAccount({
  userId,
  provider,
  providerAccountId,
  email,
  displayName,
  accessToken,
  refreshToken,
  tokenExpiresAt,
  scope
}) {
  const accountId = createId("cal-acct");
  const result = await query(
    `
      insert into calendar_accounts (
        id, user_id, provider, provider_account_id, email, display_name,
        access_token, refresh_token, token_expires_at, scope, updated_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10, now())
      on conflict (user_id, provider, provider_account_id)
      do update set
        email = excluded.email,
        display_name = excluded.display_name,
        access_token = excluded.access_token,
        refresh_token = coalesce(excluded.refresh_token, calendar_accounts.refresh_token),
        token_expires_at = excluded.token_expires_at,
        scope = excluded.scope,
        updated_at = now()
      returning id, user_id, provider, provider_account_id, email, display_name, token_expires_at, scope, created_at, updated_at
    `,
    [
      accountId,
      userId,
      provider,
      providerAccountId,
      email || null,
      displayName || null,
      accessToken,
      refreshToken || null,
      tokenExpiresAt,
      scope || null
    ]
  );

  return result.rows[0];
}

async function loadCalendarAccounts(userId) {
  const result = await query(
    `
      select id, user_id, provider, provider_account_id, email, display_name, token_expires_at, scope, created_at, updated_at
      from calendar_accounts
      where user_id = $1
      order by created_at desc
    `,
    [userId]
  );
  return result.rows;
}

async function loadCalendarAccountById(userId, accountId) {
  const result = await query(
    `
      select *
      from calendar_accounts
      where id = $1 and user_id = $2
      limit 1
    `,
    [accountId, userId]
  );
  return result.rows[0] || null;
}

async function updateAccountTokens(accountId, { accessToken, refreshToken, tokenExpiresAt, scope }) {
  await query(
    `
      update calendar_accounts
      set access_token = $1,
          refresh_token = coalesce($2, refresh_token),
          token_expires_at = $3::timestamptz,
          scope = coalesce($4, scope),
          updated_at = now()
      where id = $5
    `,
    [accessToken, refreshToken || null, tokenExpiresAt, scope || null, accountId]
  );
}

async function exchangeGoogleCode(code) {
  const params = new URLSearchParams();
  params.set("code", code);
  params.set("client_id", appConfig.calendar.google.clientId);
  params.set("client_secret", appConfig.calendar.google.clientSecret);
  params.set("redirect_uri", appConfig.calendar.google.redirectUri);
  params.set("grant_type", "authorization_code");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google token exchange failed");
  }

  return payload;
}

async function refreshGoogleToken(refreshToken) {
  const params = new URLSearchParams();
  params.set("client_id", appConfig.calendar.google.clientId);
  params.set("client_secret", appConfig.calendar.google.clientSecret);
  params.set("refresh_token", refreshToken);
  params.set("grant_type", "refresh_token");

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Google token refresh failed");
  }

  return payload;
}

async function exchangeMicrosoftCode(code) {
  const tenant = trim(appConfig.calendar.microsoft.tenant || "common");
  const params = new URLSearchParams();
  params.set("client_id", appConfig.calendar.microsoft.clientId);
  params.set("client_secret", appConfig.calendar.microsoft.clientSecret);
  params.set("redirect_uri", appConfig.calendar.microsoft.redirectUri);
  params.set("grant_type", "authorization_code");
  params.set("code", code);
  params.set("scope", "offline_access Calendars.ReadWrite User.Read");

  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Microsoft token exchange failed");
  }

  return payload;
}

async function refreshMicrosoftToken(refreshToken) {
  const tenant = trim(appConfig.calendar.microsoft.tenant || "common");
  const params = new URLSearchParams();
  params.set("client_id", appConfig.calendar.microsoft.clientId);
  params.set("client_secret", appConfig.calendar.microsoft.clientSecret);
  params.set("redirect_uri", appConfig.calendar.microsoft.redirectUri);
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", refreshToken);
  params.set("scope", "offline_access Calendars.ReadWrite User.Read");

  const response = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || payload.error || "Microsoft token refresh failed");
  }

  return payload;
}

async function fetchGoogleUserInfo(accessToken) {
  const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error_description || "Failed to fetch Google user");
  }
  return payload;
}

async function fetchMicrosoftUserInfo(accessToken) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "Failed to fetch Microsoft user");
  }
  return payload;
}

async function ensureFreshToken(account) {
  if (!account) {
    throw new Error("Calendar account missing");
  }

  const expiresAt = account.token_expires_at ? new Date(account.token_expires_at).getTime() : 0;
  if (!expiresAt || expiresAt - Date.now() > TOKEN_REFRESH_SKEW_MS) {
    return account;
  }

  if (!account.refresh_token) {
    return account;
  }

  if (account.provider === "google") {
    const refreshed = await refreshGoogleToken(account.refresh_token);
    const tokenExpiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : account.token_expires_at;
    await updateAccountTokens(account.id, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpiresAt,
      scope: refreshed.scope
    });
    return {
      ...account,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || account.refresh_token,
      token_expires_at: tokenExpiresAt,
      scope: refreshed.scope || account.scope
    };
  }

  if (account.provider === "microsoft") {
    const refreshed = await refreshMicrosoftToken(account.refresh_token);
    const tokenExpiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString() : account.token_expires_at;
    await updateAccountTokens(account.id, {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      tokenExpiresAt,
      scope: refreshed.scope
    });
    return {
      ...account,
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token || account.refresh_token,
      token_expires_at: tokenExpiresAt,
      scope: refreshed.scope || account.scope
    };
  }

  return account;
}

async function listGoogleEvents(accessToken, { start, end }) {
  const params = new URLSearchParams();
  params.set("timeMin", start);
  params.set("timeMax", end);
  params.set("singleEvents", "true");
  params.set("orderBy", "startTime");

  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "Failed to fetch Google events");
  }

  return Array.isArray(payload.items) ? payload.items : [];
}

async function listMicrosoftEvents(accessToken, { start, end }) {
  const params = new URLSearchParams();
  params.set("startDateTime", start);
  params.set("endDateTime", end);

  const response = await fetch(`https://graph.microsoft.com/v1.0/me/calendarView?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Prefer: 'outlook.timezone="UTC"'
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "Failed to fetch Microsoft events");
  }

  return Array.isArray(payload.value) ? payload.value : [];
}

function mapGoogleEvent(event, account) {
  const start = event.start?.dateTime || (event.start?.date ? `${event.start.date}T00:00:00.000Z` : null);
  const end = event.end?.dateTime || (event.end?.date ? `${event.end.date}T00:00:00.000Z` : null);
  if (!start || !end) {
    return null;
  }
  const isAllDay = Boolean(event.start?.date && !event.start?.dateTime);
  return {
    id: event.id,
    provider: "google",
    accountId: account.id,
    accountEmail: account.email,
    title: event.summary || "Busy",
    start,
    end,
    allDay: isAllDay,
    status: event.status || "busy",
    source: "calendar"
  };
}

function mapMicrosoftEvent(event, account) {
  const startValue = event.start?.dateTime || "";
  const endValue = event.end?.dateTime || "";
  const normalize = (value) => {
    if (!value) return null;
    const hasZone = /[zZ]|[+-]\\d{2}:?\\d{2}$/.test(value);
    const parsed = new Date(hasZone ? value : `${value}Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  };
  const start = normalize(startValue);
  const end = normalize(endValue);
  if (!start || !end) {
    return null;
  }
  const isAllDay = Boolean(event.isAllDay);
  return {
    id: event.id,
    provider: "microsoft",
    accountId: account.id,
    accountEmail: account.email,
    title: event.subject || "Busy",
    start,
    end,
    allDay: isAllDay,
    status: event.showAs || "busy",
    source: "calendar"
  };
}

async function createGoogleEvent(accessToken, payload) {
  const response = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to create Google event");
  }
  return data;
}

async function updateGoogleEvent(accessToken, eventId, payload) {
  const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to update Google event");
  }
  return data;
}

async function createMicrosoftEvent(accessToken, payload) {
  const response = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to create Microsoft event");
  }
  return data;
}

async function updateMicrosoftEvent(accessToken, eventId, payload) {
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${eventId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || "Failed to update Microsoft event");
  }
  return data;
}

function normalizeEventPayload(payload) {
  const title = trim(payload.title) || "Event hold";
  const start = isoFrom(payload.start, null);
  const end = isoFrom(payload.end, null);
  if (!start || !end) {
    throw new Error("Start and end time are required");
  }

  return {
    title,
    description: trim(payload.description),
    location: trim(payload.location),
    start,
    end,
    timeZone: trim(payload.timeZone) || "UTC"
  };
}

export async function createCalendarAuthUrl(userId, provider) {
  const resolvedProvider = requireProvider(provider);
  requireConfigured(resolvedProvider);
  const state = buildStateToken();
  await storeAuthState({ userId, provider: resolvedProvider, state });

  if (resolvedProvider === "google") {
    const params = new URLSearchParams();
    params.set("client_id", appConfig.calendar.google.clientId);
    params.set("redirect_uri", appConfig.calendar.google.redirectUri);
    params.set("response_type", "code");
    params.set("access_type", "offline");
    params.set("prompt", "consent");
    params.set("scope", "https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile");
    params.set("state", state);
    params.set("include_granted_scopes", "true");

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  const tenant = trim(appConfig.calendar.microsoft.tenant || "common");
  const params = new URLSearchParams();
  params.set("client_id", appConfig.calendar.microsoft.clientId);
  params.set("redirect_uri", appConfig.calendar.microsoft.redirectUri);
  params.set("response_type", "code");
  params.set("response_mode", "query");
  params.set("scope", "offline_access Calendars.ReadWrite User.Read");
  params.set("state", state);

  return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function handleCalendarOAuthCallback({ provider, code, state }) {
  const resolvedProvider = requireProvider(provider);
  requireConfigured(resolvedProvider);

  const authState = await consumeAuthState(state);
  if (!authState || authState.provider !== resolvedProvider) {
    throw new Error("Calendar authorization has expired or is invalid");
  }

  if (resolvedProvider === "google") {
    const tokenPayload = await exchangeGoogleCode(code);
    const tokenExpiresAt = tokenPayload.expires_in ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString() : null;
    const profile = await fetchGoogleUserInfo(tokenPayload.access_token);
    const providerAccountId = profile.sub || profile.id || profile.email;
    return upsertCalendarAccount({
      userId: authState.user_id,
      provider: "google",
      providerAccountId: providerAccountId || profile.email,
      email: profile.email,
      displayName: profile.name,
      accessToken: tokenPayload.access_token,
      refreshToken: tokenPayload.refresh_token,
      tokenExpiresAt,
      scope: tokenPayload.scope
    });
  }

  const tokenPayload = await exchangeMicrosoftCode(code);
  const tokenExpiresAt = tokenPayload.expires_in ? new Date(Date.now() + tokenPayload.expires_in * 1000).toISOString() : null;
  const profile = await fetchMicrosoftUserInfo(tokenPayload.access_token);
  const providerAccountId = profile.id || profile.userPrincipalName || profile.mail;

  return upsertCalendarAccount({
    userId: authState.user_id,
    provider: "microsoft",
    providerAccountId: providerAccountId || profile.mail,
    email: profile.mail || profile.userPrincipalName,
    displayName: profile.displayName,
    accessToken: tokenPayload.access_token,
    refreshToken: tokenPayload.refresh_token,
    tokenExpiresAt,
    scope: tokenPayload.scope
  });
}

export async function listCalendarAccounts(userId) {
  return loadCalendarAccounts(userId);
}

export async function deleteCalendarAccount(userId, accountId) {
  const account = await loadCalendarAccountById(userId, accountId);
  if (!account) {
    return false;
  }
  await query("delete from calendar_accounts where id = $1", [accountId]);
  return true;
}

export async function getCalendarTimeline(userId, { start, end }) {
  const startIso = isoFrom(start, nowIso());
  const endIso = isoFrom(end, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());

  const accounts = await loadCalendarAccounts(userId);
  const events = [];

  for (const account of accounts) {
    const hydrated = await ensureFreshToken(account);
    if (hydrated.provider === "google") {
      const googleEvents = await listGoogleEvents(hydrated.access_token, { start: startIso, end: endIso });
      googleEvents.forEach((event) => {
        const mapped = mapGoogleEvent(event, hydrated);
        if (mapped) events.push(mapped);
      });
    } else if (hydrated.provider === "microsoft") {
      const msEvents = await listMicrosoftEvents(hydrated.access_token, { start: startIso, end: endIso });
      msEvents.forEach((event) => {
        const mapped = mapMicrosoftEvent(event, hydrated);
        if (mapped) events.push(mapped);
      });
    }
  }

  const busyBlocks = mergeBusyBlocks(events.map((event) => ({ start: event.start, end: event.end })));
  const freeBlocks = deriveFreeBlocks(busyBlocks, startIso, endIso);

  return {
    start: startIso,
    end: endIso,
    accounts: accounts.map((account) => ({
      id: account.id,
      provider: account.provider,
      email: account.email,
      displayName: account.display_name
    })),
    events,
    busy: busyBlocks,
    free: freeBlocks
  };
}

export async function createCalendarEvent(userId, payload) {
  const normalized = normalizeEventPayload(payload);
  const accountIds = Array.isArray(payload.accountIds) ? payload.accountIds.filter(Boolean) : [];

  if (accountIds.length === 0) {
    throw new Error("Select at least one calendar to create the event");
  }

  const results = [];
  for (const accountId of accountIds) {
    const account = await loadCalendarAccountById(userId, accountId);
    if (!account) {
      continue;
    }
    const hydrated = await ensureFreshToken(account);

    if (hydrated.provider === "google") {
      const created = await createGoogleEvent(hydrated.access_token, {
        summary: normalized.title,
        description: normalized.description || undefined,
        location: normalized.location || undefined,
        start: { dateTime: normalized.start, timeZone: normalized.timeZone },
        end: { dateTime: normalized.end, timeZone: normalized.timeZone }
      });

      const inserted = await query(
        `
          insert into calendar_events (
            id, user_id, plan_id, calendar_account_id, provider, calendar_id,
            external_event_id, title, start_time, end_time, time_zone, status
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11, $12)
          returning id
        `,
        [
          createId("cal-event"),
          userId,
          payload.planId || null,
          account.id,
          "google",
          "primary",
          created.id,
          created.summary || normalized.title,
          created.start?.dateTime || normalized.start,
          created.end?.dateTime || normalized.end,
          normalized.timeZone,
          created.status || "confirmed"
        ]
      );

      results.push({
        provider: "google",
        accountId: account.id,
        eventId: created.id,
        calendarEventId: inserted.rows[0]?.id || null
      });
      continue;
    }

    if (hydrated.provider === "microsoft") {
      const created = await createMicrosoftEvent(hydrated.access_token, {
        subject: normalized.title,
        body: {
          contentType: "text",
          content: normalized.description || ""
        },
        location: normalized.location ? { displayName: normalized.location } : undefined,
        start: { dateTime: normalized.start, timeZone: normalized.timeZone },
        end: { dateTime: normalized.end, timeZone: normalized.timeZone }
      });

      const inserted = await query(
        `
          insert into calendar_events (
            id, user_id, plan_id, calendar_account_id, provider, calendar_id,
            external_event_id, title, start_time, end_time, time_zone, status
          ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $10::timestamptz, $11, $12)
          returning id
        `,
        [
          createId("cal-event"),
          userId,
          payload.planId || null,
          account.id,
          "microsoft",
          "primary",
          created.id,
          created.subject || normalized.title,
          created.start?.dateTime || normalized.start,
          created.end?.dateTime || normalized.end,
          normalized.timeZone,
          created.showAs || "busy"
        ]
      );

      results.push({
        provider: "microsoft",
        accountId: account.id,
        eventId: created.id,
        calendarEventId: inserted.rows[0]?.id || null
      });
    }
  }

  return {
    ok: true,
    results
  };
}

export async function updateCalendarEvent(userId, calendarEventId, payload) {
  const normalized = normalizeEventPayload(payload);
  const result = await query(
    `
      select *
      from calendar_events
      where id = $1 and user_id = $2
      limit 1
    `,
    [calendarEventId, userId]
  );
  const record = result.rows[0];
  if (!record) {
    return { error: "Calendar event not found" };
  }

  const account = await loadCalendarAccountById(userId, record.calendar_account_id);
  if (!account) {
    return { error: "Calendar account not found" };
  }

  const hydrated = await ensureFreshToken(account);
  if (record.provider === "google") {
    const updated = await updateGoogleEvent(hydrated.access_token, record.external_event_id, {
      summary: normalized.title,
      description: normalized.description || undefined,
      location: normalized.location || undefined,
      start: { dateTime: normalized.start, timeZone: normalized.timeZone },
      end: { dateTime: normalized.end, timeZone: normalized.timeZone }
    });

    await query(
      `
        update calendar_events
        set title = $1,
            start_time = $2::timestamptz,
            end_time = $3::timestamptz,
            time_zone = $4,
            status = $5,
            updated_at = now()
        where id = $6
      `,
      [
        updated.summary || normalized.title,
        updated.start?.dateTime || normalized.start,
        updated.end?.dateTime || normalized.end,
        normalized.timeZone,
        updated.status || "confirmed",
        calendarEventId
      ]
    );

    return { ok: true };
  }

  if (record.provider === "microsoft") {
    const updated = await updateMicrosoftEvent(hydrated.access_token, record.external_event_id, {
      subject: normalized.title,
      body: {
        contentType: "text",
        content: normalized.description || ""
      },
      location: normalized.location ? { displayName: normalized.location } : undefined,
      start: { dateTime: normalized.start, timeZone: normalized.timeZone },
      end: { dateTime: normalized.end, timeZone: normalized.timeZone }
    });

    await query(
      `
        update calendar_events
        set title = $1,
            start_time = $2::timestamptz,
            end_time = $3::timestamptz,
            time_zone = $4,
            status = $5,
            updated_at = now()
        where id = $6
      `,
      [
        updated.subject || normalized.title,
        updated.start?.dateTime || normalized.start,
        updated.end?.dateTime || normalized.end,
        normalized.timeZone,
        updated.showAs || "busy",
        calendarEventId
      ]
    );

    return { ok: true };
  }

  return { error: "Unsupported calendar provider" };
}
