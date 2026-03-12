const apiKey = process.env.EMAIL_CLIENT_API_KEY || "";
const provider = (process.env.EMAIL_CLIENT_PROVIDER || "").toLowerCase();
const inboundDomain = process.env.EMAIL_CLIENT_INBOUND_DOMAIN || "";
const webhookSecret = process.env.EMAIL_CLIENT_WEBHOOK_SECRET || "";
const appBaseUrl = process.env.APP_BASE_URL || "";
const apiBase = (process.env.EMAIL_CLIENT_API_BASE || "https://api.mailgun.net").replace(/\/+$/, "");
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
  return `${baseUrl}/api/webhooks/mailgun/inbound?token=${encodeURIComponent(webhookSecret)}`;
}

function buildAuthHeader() {
  return `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`;
}

async function mailgunRequest(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      authorization: buildAuthHeader(),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.message || `Mailgun request failed with status ${response.status}`);
  }

  return data;
}

async function main() {
  assertConfig(provider === "mailgun", "EMAIL_CLIENT_PROVIDER must be set to mailgun");
  assertConfig(apiKey, "EMAIL_CLIENT_API_KEY is required");
  assertConfig(inboundDomain, "EMAIL_CLIENT_INBOUND_DOMAIN is required");
  assertConfig(webhookSecret, "EMAIL_CLIENT_WEBHOOK_SECRET is required");
  assertConfig(appBaseUrl, "APP_BASE_URL is required");

  const webhookUrl = buildWebhookUrl();
  const expression = `match_recipient(".*@${inboundDomain}")`;
  const list = await mailgunRequest("/v3/routes");
  const routes = list.items || [];

  const exactMatch = routes.find(
    (route) =>
      route.expression === expression &&
      Array.isArray(route.actions) &&
      route.actions.includes(`forward("${webhookUrl}")`)
  );

  if (exactMatch) {
    console.log(
      JSON.stringify(
        {
          status: "unchanged",
          routeId: exactMatch.id,
          expression,
          url: webhookUrl
        },
        null,
        2
      )
    );
    return;
  }

  const sameDomain = routes.filter((route) => route.expression === expression);

  if (sameDomain.length > 0 && !replaceDomain) {
    console.log(
      JSON.stringify(
        {
          status: "conflict",
          message: "Inbound route(s) already exist for this domain. Re-run with --replace-domain to replace them.",
          existing: sameDomain.map((route) => ({
            id: route.id,
            expression: route.expression,
            actions: route.actions
          })),
          requested: {
            expression,
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

  for (const route of sameDomain) {
    await mailgunRequest(`/v3/routes/${route.id}`, {
      method: "DELETE"
    });
  }

  const form = new URLSearchParams();
  form.set("priority", "0");
  form.set("description", "AI Event Planner inbound replies");
  form.set("expression", expression);
  form.append("action", `forward("${webhookUrl}")`);
  form.append("action", "stop()");

  const created = await mailgunRequest("/v3/routes", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: form.toString()
  });

  console.log(
    JSON.stringify(
      {
        status: "created",
        routeId: created.route?.id || null,
        expression,
        url: webhookUrl,
        replaced: sameDomain.map((route) => route.id)
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
