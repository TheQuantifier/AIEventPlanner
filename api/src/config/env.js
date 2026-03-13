function read(name, fallback = "") {
  return process.env[name] || fallback;
}

export const appConfig = {
  emailClient: {
    provider: read("EMAIL_CLIENT_PROVIDER"),
    apiKey: read("EMAIL_CLIENT_API_KEY"),
    apiBase: read("EMAIL_CLIENT_API_BASE", "https://api.mailgun.net"),
    domain: read("EMAIL_CLIENT_DOMAIN"),
    senderName: read("EMAIL_CLIENT_SENDER_NAME"),
    senderEmail: read("EMAIL_CLIENT_SENDER_EMAIL"),
    replyTo: read("EMAIL_CLIENT_REPLY_TO"),
    inboundDomain: read("EMAIL_CLIENT_INBOUND_DOMAIN"),
    webhookSecret: read("EMAIL_CLIENT_WEBHOOK_SECRET"),
    webhookSigningKey: read("EMAIL_CLIENT_WEBHOOK_SIGNING_KEY"),
    testMode: read("EMAIL_CLIENT_TEST_MODE", "false"),
    testRecipient: read("EMAIL_CLIENT_TEST_RECIPIENT")
  },
  db: {
    provider: read("DB_PROVIDER"),
    url: read("DB_URL"),
    directUrl: read("DB_DIRECT_URL")
  },
  ai: {
    provider: read("AI_PROVIDER"),
    apiKey: read("AI_API_KEY"),
    model: read("AI_MODEL")
  }
};

export function getConfigStatus() {
  return {
    emailClient: {
      provider: appConfig.emailClient.provider || "unset",
      configured: Boolean(appConfig.emailClient.apiKey && appConfig.emailClient.senderEmail && appConfig.emailClient.domain),
      inboundConfigured: Boolean(appConfig.emailClient.inboundDomain),
      testMode: String(appConfig.emailClient.testMode).toLowerCase() === "true"
    },
    db: {
      provider: appConfig.db.provider || "unset",
      configured: Boolean(appConfig.db.url)
    },
    ai: {
      provider: appConfig.ai.provider || "unset",
      configured: Boolean(appConfig.ai.apiKey)
    }
  };
}
