const apiKey = process.env.EMAIL_CLIENT_API_KEY || "";
const provider = (process.env.EMAIL_CLIENT_PROVIDER || "").toLowerCase();
const inboundDomain = process.env.EMAIL_CLIENT_INBOUND_DOMAIN || "";
const webhookSecret = process.env.EMAIL_CLIENT_WEBHOOK_SECRET || "";
const appBaseUrl = process.env.APP_BASE_URL || "";
const replaceDomain = process.argv.includes("--replace-domain");

function assertConfig(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function buildWebhookUrl() {
  const baseUrl = trimTrailingSlash(appBaseUrl);
  return `${baseUrl}/api/webhooks/brevo/inbound?token=${encodeURIComponent(webhookSecret)}`;
}

async function brevoRequest(path, options = {}) {
  const response = await fetch(`https://api.brevo.com${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
      ...(options.headers || {})
    }
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Brevo request failed with status ${response.status}`);
  }

  return data;
}

async function main() {
  assertConfig(provider === "brevo", "EMAIL_CLIENT_PROVIDER must be set to brevo");
  assertConfig(apiKey, "EMAIL_CLIENT_API_KEY is required");
  assertConfig(inboundDomain, "EMAIL_CLIENT_INBOUND_DOMAIN is required");
  assertConfig(webhookSecret, "EMAIL_CLIENT_WEBHOOK_SECRET is required");
  assertConfig(appBaseUrl, "APP_BASE_URL is required");

  const webhookUrl = buildWebhookUrl();
  const list = await brevoRequest("/v3/webhooks?type=inbound");
  const webhooks = list.webhooks || [];

  const exactMatch = webhooks.find(
    (webhook) => webhook.type === "inbound" && webhook.domain === inboundDomain && webhook.url === webhookUrl
  );

  if (exactMatch) {
    console.log(
      JSON.stringify(
        {
          status: "unchanged",
          webhookId: exactMatch.id,
          domain: inboundDomain,
          url: webhookUrl
        },
        null,
        2
      )
    );
    return;
  }

  const sameDomain = webhooks.filter((webhook) => webhook.type === "inbound" && webhook.domain === inboundDomain);

  if (sameDomain.length > 0 && !replaceDomain) {
    console.log(
      JSON.stringify(
        {
          status: "conflict",
          message: "Inbound webhook(s) already exist for this domain. Re-run with --replace-domain to replace them.",
          existing: sameDomain.map((webhook) => ({
            id: webhook.id,
            domain: webhook.domain,
            url: webhook.url
          })),
          requested: {
            domain: inboundDomain,
            url: webhookUrl
          }
        },
        null,
        2
      )
    );
    process.exitCode = 1;
    return;
  }

  for (const webhook of sameDomain) {
    await brevoRequest(`/v3/webhooks/${webhook.id}`, {
      method: "DELETE"
    });
  }

  const created = await brevoRequest("/v3/webhooks", {
    method: "POST",
    body: JSON.stringify({
      type: "inbound",
      events: ["inboundEmailProcessed"],
      url: webhookUrl,
      domain: inboundDomain,
      description: "AI Event Planner inbound replies"
    })
  });

  console.log(
    JSON.stringify(
      {
        status: "created",
        webhookId: created.id,
        domain: inboundDomain,
        url: webhookUrl,
        replaced: sameDomain.map((webhook) => webhook.id)
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
