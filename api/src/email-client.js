import { appConfig, isTestingStage } from "./config/env.js";
import crypto from "node:crypto";

function trim(value) {
  return String(value || "").trim();
}

function trimTrailingSlash(value) {
  return trim(value).replace(/\/+$/, "");
}

function isTestModeEnabled() {
  return isTestingStage() || trim(appConfig.emailClient.testMode).toLowerCase() === "true";
}

function resolveAppInbox() {
  return (
    trim(appConfig.emailClient.testRecipient) ||
    trim(appConfig.emailClient.replyTo) ||
    trim(appConfig.emailClient.senderEmail)
  );
}

function resolveRecipient(to) {
  if (!isTestModeEnabled()) {
    return {
      intendedRecipient: to,
      deliveryRecipient: to,
      deliveryMode: "direct-to-vendor"
    };
  }

  const appInbox = resolveAppInbox();

  return {
    intendedRecipient: to,
    deliveryRecipient: appInbox || to,
    deliveryMode: "rerouted-to-app-inbox"
  };
}

export function isEmailClientConfigured() {
  return Boolean(
    trim(appConfig.emailClient.provider).toLowerCase() === "mailgun" &&
      trim(appConfig.emailClient.apiKey) &&
      trim(appConfig.emailClient.senderEmail) &&
      trim(appConfig.emailClient.domain)
  );
}

export function buildPlanReplyAddress(planId) {
  const inboundDomain = trim(appConfig.emailClient.inboundDomain);

  if (!inboundDomain) {
    return trim(appConfig.emailClient.replyTo) || "";
  }

  return `${planId}@${inboundDomain}`;
}

export async function sendEmail({ to, subject, text, replyTo, tags = [] }) {
  if (!isEmailClientConfigured()) {
    return {
      ok: false,
      skipped: true,
      reason: "email client not configured"
    };
  }

  if (isTestModeEnabled() && !resolveAppInbox()) {
    return {
      ok: false,
      skipped: true,
      reason: "testing delivery requires EMAIL_CLIENT_TEST_RECIPIENT, EMAIL_CLIENT_REPLY_TO, or EMAIL_CLIENT_SENDER_EMAIL"
    };
  }

  const { intendedRecipient, deliveryRecipient, deliveryMode } = resolveRecipient(to);
  const form = new URLSearchParams();
  form.set("from", `${appConfig.emailClient.senderName || "AI Event Planner"} <${appConfig.emailClient.senderEmail}>`);
  form.set("to", deliveryRecipient);
  form.set("subject", subject);
  form.set("text", text);

  const finalReplyTo = trim(replyTo) || trim(appConfig.emailClient.replyTo);
  if (finalReplyTo) {
    form.set("h:Reply-To", finalReplyTo);
  }

  if (tags.length > 0) {
    form.set("o:tag", tags[0]);
    tags.slice(1).forEach((tag) => form.append("o:tag", tag));
  }

  const auth = Buffer.from(`api:${appConfig.emailClient.apiKey}`).toString("base64");
  const apiBase = trimTrailingSlash(appConfig.emailClient.apiBase || "https://api.mailgun.net");
  const response = await fetch(`${apiBase}/v3/${appConfig.emailClient.domain}/messages`, {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Mailgun request failed with status ${response.status}`);
  }

  return {
    ok: true,
    skipped: false,
    provider: "mailgun",
    messageId: data.id || null,
    intendedRecipient,
    deliveredTo: deliveryRecipient,
    deliveryMode,
    appInbox: resolveAppInbox() || null,
    testMode: isTestModeEnabled(),
    stage: appConfig.app.stage
  };
}

export function validateWebhookToken(url) {
  const expected = trim(appConfig.emailClient.webhookSecret);
  if (!expected) {
    return true;
  }

  return url.searchParams.get("token") === expected;
}

export function validateMailgunSignature(payload) {
  const signingKey = trim(appConfig.emailClient.webhookSigningKey);

  if (!signingKey) {
    return true;
  }

  const timestamp = trim(payload.timestamp);
  const token = trim(payload.token);
  const signature = trim(payload.signature);

  if (!timestamp || !token || !signature) {
    return false;
  }

  const digest = crypto
    .createHmac("sha256", signingKey)
    .update(`${timestamp}${token}`)
    .digest("hex");

  if (digest.length !== signature.length) {
    return false;
  }

  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
