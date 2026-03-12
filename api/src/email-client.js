import { appConfig } from "./config/env.js";

const BREVO_API_URL = "https://api.brevo.com/v3/smtp/email";

function trim(value) {
  return String(value || "").trim();
}

export function isEmailClientConfigured() {
  return Boolean(
    trim(appConfig.emailClient.provider).toLowerCase() === "brevo" &&
      trim(appConfig.emailClient.apiKey) &&
      trim(appConfig.emailClient.senderEmail)
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

  const payload = {
    sender: {
      name: appConfig.emailClient.senderName || "AI Event Planner",
      email: appConfig.emailClient.senderEmail
    },
    to: [{ email: to }],
    subject,
    textContent: text
  };

  const finalReplyTo = trim(replyTo) || trim(appConfig.emailClient.replyTo);
  if (finalReplyTo) {
    payload.replyTo = {
      email: finalReplyTo
    };
  }

  if (tags.length > 0) {
    payload.tags = tags;
  }

  const response = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": appConfig.emailClient.apiKey
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Brevo request failed with status ${response.status}`);
  }

  return {
    ok: true,
    skipped: false,
    provider: "brevo",
    messageId: data.messageId || null
  };
}

export function validateWebhookToken(url) {
  const expected = trim(appConfig.emailClient.webhookSecret);
  if (!expected) {
    return true;
  }

  return url.searchParams.get("token") === expected;
}
