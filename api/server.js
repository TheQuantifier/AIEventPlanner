import http from "node:http";
import { appConfig, getConfigStatus } from "./src/config/env.js";
import { runMigrations } from "./src/migrations.js";
import {
  createCalendarAuthUrl,
  createCalendarEvent,
  deleteCalendarAccount,
  getCalendarTimeline,
  handleCalendarOAuthCallback,
  listCalendarAccounts,
  updateCalendarEvent
} from "./src/calendar.js";
import {
  confirmAccountDeletion,
  confirmPasswordChange,
  createOAuthAuthUrl,
  createSessionForCredentials,
  createSessionForOAuthCallback,
  getUserFromToken,
  registerUser,
  requestAccountDeletionVerification,
  requestPasswordChangeVerification,
  requestPasswordReset,
  resetPassword,
  revokeSession,
  updateUserProfile
} from "./src/auth.js";
import { sendEmail, validateMailgunSignature, validateWebhookToken } from "./src/email-client.js";
import {
  analyzeIntake,
  createPlan,
  finalizeVendorSelection,
  getPlan,
  listAllPlans,
  recordInboundReply,
  removePlan,
  sendPlanInquiries,
  setPlanPaused,
  updatePlan,
  updatePlanVendorCategories
} from "./src/planner.js";

const PORT = Number(process.env.PORT || 4000);

class HttpError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.statusCode = statusCode;
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  response.end(html);
}

function sendNotFound(response) {
  sendJson(response, 404, {
    error: "Not found"
  });
}

async function readBodyBuffer(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

async function readJsonBody(request) {
  const body = (await readBodyBuffer(request)).toString("utf8");

  if (!body) {
    return {};
  }

  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

async function readFormBody(request) {
  const buffer = await readBodyBuffer(request);
  const contentType = request.headers["content-type"] || "application/x-www-form-urlencoded";
  const formData = await new Response(buffer, {
    headers: {
      "content-type": contentType
    }
  }).formData();

  const payload = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = typeof value === "string" ? value : value.name;
  }

  return payload;
}

function extractBearerToken(request) {
  const header = request.headers.authorization || "";
  const match = String(header).match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    return sendNotFound(response);
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization"
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const path = url.pathname;

  try {
    const currentUser = path.startsWith("/api/") && !path.startsWith("/api/auth/") && path !== "/api/webhooks/mailgun/inbound" && !path.startsWith("/api/calendar/callback")
      ? await getUserFromToken(extractBearerToken(request))
      : null;

    if (request.method === "GET" && path === "/health") {
      return sendJson(response, 200, {
        ok: true,
        integrations: getConfigStatus()
      });
    }

    if (request.method === "POST" && path === "/api/auth/register") {
      const payload = await readJsonBody(request);
      const registration = await registerUser(payload);

      if (registration.error) {
        return sendJson(response, 400, registration);
      }

      const session = await createSessionForCredentials(payload);
      return sendJson(response, 201, session);
    }

    if (request.method === "POST" && path === "/api/auth/login") {
      const payload = await readJsonBody(request);
      const session = await createSessionForCredentials(payload);
      return sendJson(response, session.error ? 401 : 200, session);
    }

    if (request.method === "POST" && path.startsWith("/api/auth/oauth/")) {
      const provider = path.replace("/api/auth/oauth/", "");
      const authUrl = await createOAuthAuthUrl(provider);
      return sendJson(response, 200, { url: authUrl });
    }

    if (request.method === "GET" && path.startsWith("/api/auth/callback/")) {
      const provider = path.replace("/api/auth/callback/", "");
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || "";
      const error = url.searchParams.get("error");
      const redirectBase = appConfig.app.webBaseUrl || appConfig.app.baseUrl || "";

      if (!redirectBase) {
        return sendJson(response, 500, { error: "WEB_BASE_URL or APP_BASE_URL must be configured for OAuth sign-in" });
      }

      const redirectUrl = new URL(redirectBase.replace(/\/+$/, "") + "/login");

      if (error) {
        redirectUrl.searchParams.set("oauthError", error);
        return sendHtml(
          response,
          400,
          `<html><head><meta http-equiv="refresh" content="0; url=${redirectUrl.toString()}" /></head><body>Sign-in failed. You can close this window.</body></html>`
        );
      }

      if (!code || !state) {
        redirectUrl.searchParams.set("oauthError", "missing_authorization_details");
        return sendHtml(
          response,
          400,
          `<html><head><meta http-equiv="refresh" content="0; url=${redirectUrl.toString()}" /></head><body>Missing authorization details.</body></html>`
        );
      }

      try {
        const session = await createSessionForOAuthCallback({ provider, code, state });
        redirectUrl.searchParams.set("oauth", "success");
        redirectUrl.searchParams.set("token", session.token);
        return sendHtml(
          response,
          200,
          `<html><head><meta http-equiv="refresh" content="0; url=${redirectUrl.toString()}" /></head><body>Sign-in complete. You can close this window.</body></html>`
        );
      } catch (callbackError) {
        redirectUrl.searchParams.set("oauthError", callbackError instanceof Error ? callbackError.message : String(callbackError));
        return sendHtml(
          response,
          400,
          `<html><head><meta http-equiv="refresh" content="0; url=${redirectUrl.toString()}" /></head><body>Sign-in failed. You can close this window.</body></html>`
        );
      }
    }

    if (request.method === "GET" && path === "/api/auth/me") {
      const user = await getUserFromToken(extractBearerToken(request));
      return sendJson(response, user ? 200 : 401, user ? { user } : { error: "Unauthorized" });
    }

    if (request.method === "POST" && path === "/api/auth/logout") {
      await revokeSession(extractBearerToken(request));
      return sendJson(response, 200, { ok: true });
    }

    if (request.method === "POST" && path === "/api/auth/forgot-password") {
      const payload = await readJsonBody(request);
      const result = await requestPasswordReset(payload);
      return sendJson(response, result.error ? 400 : 200, result.error ? result : { ok: true });
    }

    if (request.method === "POST" && path === "/api/auth/reset-password") {
      const payload = await readJsonBody(request);
      const result = await resetPassword(payload);
      return sendJson(response, result.error ? 400 : 200, result);
    }

    if (request.method === "POST" && path === "/api/public/contact") {
      const payload = await readJsonBody(request);
      const message = String(payload.message || "").trim();
      const email = String(payload.email || "").trim();

      if (!message) {
        return sendJson(response, 400, { error: "Message is required" });
      }

      const result = await sendEmail({
        to: "jhandalex100@gmail.com",
        subject: "AI Event Planner contact form",
        text: [
          "New contact form message:",
          "",
          email ? `From: ${email}` : "From: not provided",
          "",
          message
        ].join("\n"),
        replyTo: email || undefined,
        fromName: "AI Event Planner Contact",
        fromEmail: appConfig.emailClient.senderEmail || undefined,
        tags: ["contact-form"]
      });

      return sendJson(response, result.ok ? 200 : 400, result.ok ? { ok: true } : { error: result.reason || "Unable to send message" });
    }

    if (path.startsWith("/api/") && !path.startsWith("/api/auth/") && path !== "/api/webhooks/mailgun/inbound" && !path.startsWith("/api/calendar/callback") && !currentUser) {
      return sendJson(response, 401, { error: "Unauthorized" });
    }

    if (request.method === "PUT" && path === "/api/account/profile") {
      const payload = await readJsonBody(request);
      const result = await updateUserProfile(currentUser.id, payload);
      return sendJson(response, result.error ? 400 : 200, result.error ? result : { user: result.user });
    }

    if (request.method === "POST" && path === "/api/account/change-password/request") {
      const payload = await readJsonBody(request);
      const result = await requestPasswordChangeVerification(currentUser.id, payload);
      return sendJson(response, result.error ? 400 : 200, result.error ? result : { ok: true });
    }

    if (request.method === "POST" && path === "/api/account/change-password/confirm") {
      const payload = await readJsonBody(request);
      const result = await confirmPasswordChange(currentUser.id, payload);
      return sendJson(response, result.error ? 400 : 200, result);
    }

    if (request.method === "POST" && path === "/api/account/delete/request") {
      const result = await requestAccountDeletionVerification(currentUser.id);
      return sendJson(response, result.error ? 400 : 200, result.error ? result : { ok: true });
    }

    if (request.method === "POST" && path === "/api/account/delete/confirm") {
      const payload = await readJsonBody(request);
      const result = await confirmAccountDeletion(currentUser.id, payload);
      return sendJson(response, result.error ? 400 : 200, result);
    }

    if (request.method === "GET" && path === "/api/calendar/accounts") {
      const accounts = await listCalendarAccounts(currentUser.id);
      return sendJson(response, 200, { items: accounts });
    }

    if (request.method === "POST" && path.startsWith("/api/calendar/connect/")) {
      const provider = path.replace("/api/calendar/connect/", "");
      const url = await createCalendarAuthUrl(currentUser.id, provider);
      return sendJson(response, 200, { url });
    }

    if (request.method === "GET" && path.startsWith("/api/calendar/callback/")) {
      const provider = path.replace("/api/calendar/callback/", "");
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || "";
      const error = url.searchParams.get("error");

      if (error) {
        return sendHtml(response, 400, `<p>Calendar authorization failed: ${error}</p>`);
      }

      if (!code || !state) {
        return sendHtml(response, 400, "<p>Missing authorization details.</p>");
      }

      try {
        const account = await handleCalendarOAuthCallback({ provider, code, state });
        const redirectBase = appConfig.app.webBaseUrl || appConfig.app.baseUrl || "";
        if (redirectBase) {
          const redirectUrl = new URL(redirectBase.replace(/\/+$/, "") + "/");
          redirectUrl.searchParams.set("calendar", "connected");
          redirectUrl.searchParams.set("provider", account.provider);
          return sendHtml(
            response,
            200,
            `<html><head><meta http-equiv="refresh" content="0; url=${redirectUrl.toString()}" /></head><body>Calendar connected. You can close this window.</body></html>`
          );
        }

        return sendJson(response, 200, { ok: true, account });
      } catch (callbackError) {
        return sendHtml(
          response,
          400,
          `<p>Calendar authorization failed: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}</p>`
        );
      }
    }

    if (request.method === "DELETE" && path.startsWith("/api/calendar/accounts/")) {
      const accountId = path.replace("/api/calendar/accounts/", "");
      const removed = await deleteCalendarAccount(currentUser.id, accountId);
      return sendJson(response, removed ? 200 : 404, removed ? { ok: true } : { error: "Calendar account not found" });
    }

    if (request.method === "GET" && path === "/api/calendar/timeline") {
      const start = url.searchParams.get("start");
      const end = url.searchParams.get("end");
      const timeline = await getCalendarTimeline(currentUser.id, { start, end });
      return sendJson(response, 200, timeline);
    }

    if (request.method === "POST" && path === "/api/calendar/events") {
      const payload = await readJsonBody(request);
      const result = await createCalendarEvent(currentUser.id, payload);
      return sendJson(response, 200, result);
    }

    if (request.method === "PATCH" && path.startsWith("/api/calendar/events/")) {
      const calendarEventId = path.replace("/api/calendar/events/", "");
      const payload = await readJsonBody(request);
      const result = await updateCalendarEvent(currentUser.id, calendarEventId, payload);
      return sendJson(response, result.error ? 404 : 200, result.error ? result : { ok: true });
    }

    if (request.method === "GET" && path === "/api/plans") {
      const plans = await listAllPlans(currentUser.id);
      return sendJson(response, 200, { items: plans });
    }

    if (request.method === "POST" && path === "/api/plans") {
      const payload = await readJsonBody(request);
      const plan = await createPlan(payload, currentUser);
      return sendJson(response, 201, plan);
    }

    if (request.method === "PUT" && path.startsWith("/api/plans/")) {
      const planId = path.replace("/api/plans/", "");
      const payload = await readJsonBody(request);
      const plan = await updatePlan(planId, payload, currentUser);

      if (!plan) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      return sendJson(response, 200, plan);
    }

    if (request.method === "PATCH" && path.endsWith("/vendor-categories")) {
      const [, , , planId] = path.split("/");
      const payload = await readJsonBody(request);
      const plan = await updatePlanVendorCategories(planId, payload.selectedVendorCategories, currentUser.id);

      if (!plan) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      return sendJson(response, 200, plan);
    }

    if (request.method === "POST" && path === "/api/intake") {
      const payload = await readJsonBody(request);
      const intake = await analyzeIntake(payload);
      return sendJson(response, 200, intake);
    }

    if (request.method === "GET" && path.startsWith("/api/plans/")) {
      const planId = path.replace("/api/plans/", "");
      const plan = await getPlan(planId, currentUser.id);

      if (!plan) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      return sendJson(response, 200, plan);
    }

    if (request.method === "PATCH" && path.endsWith("/pause")) {
      const [, , , planId] = path.split("/");
      const payload = await readJsonBody(request);
      const plan = await setPlanPaused(planId, payload.paused, currentUser.id);

      if (!plan) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      return sendJson(response, 200, plan);
    }

    if (request.method === "POST" && path.endsWith("/send-inquiries")) {
      const [, , , planId] = path.split("/");
      const result = await sendPlanInquiries(planId, currentUser.id);

      if (!result) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      if (result.error) {
        return sendJson(response, 400, result);
      }

      return sendJson(response, 200, result);
    }

    if (request.method === "POST" && path.endsWith("/finalize")) {
      const [, , , planId] = path.split("/");
      const payload = await readJsonBody(request);
      const result = await finalizeVendorSelection(planId, payload.vendorId, currentUser.id);

      if (!result) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      if (result.error) {
        return sendJson(response, 400, result);
      }

      return sendJson(response, 200, result);
    }

    if (request.method === "DELETE" && path.startsWith("/api/plans/")) {
      const planId = path.replace("/api/plans/", "");
      const removed = await removePlan(planId, currentUser.id);

      if (!removed) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      return sendJson(response, 200, { ok: true, planId });
    }

    if (request.method === "POST" && path === "/api/webhooks/mailgun/inbound") {
      if (!validateWebhookToken(url)) {
        return sendJson(response, 401, { error: "Invalid webhook token" });
      }

      const payload = await readFormBody(request);

      if (!validateMailgunSignature(payload)) {
        return sendJson(response, 401, { error: "Invalid Mailgun signature" });
      }

      const result = await recordInboundReply(payload);
      return sendJson(response, result.ok ? 200 : 400, result);
    }

    return sendNotFound(response);
  } catch (error) {
    const statusCode = error?.statusCode || 500;
    const message = error instanceof Error ? error.message : String(error);
    return sendJson(response, statusCode, statusCode === 500
      ? { error: "Internal server error", details: message }
      : { error: message });
  }
});

runMigrations()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Failed to run database migrations", error);
    process.exit(1);
  });
