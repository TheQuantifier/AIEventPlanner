function read(name, fallback = "") {
  return process.env[name] || fallback;
}

function trim(value) {
  return String(value || "").trim();
}

export function getAppStage() {
  return trim(read("APP_STAGE", "development")).toLowerCase() || "development";
}

export function isTestingStage() {
  return getAppStage() === "testing";
}

export const appConfig = {
  app: {
    stage: getAppStage(),
    baseUrl: read("APP_BASE_URL"),
    webBaseUrl: read("WEB_BASE_URL")
  },
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
  },
  calendar: {
    google: {
      clientId: read("GOOGLE_OAUTH_CLIENT_ID"),
      clientSecret: read("GOOGLE_OAUTH_CLIENT_SECRET"),
      redirectUri: read("GOOGLE_OAUTH_REDIRECT_URI")
    },
    microsoft: {
      clientId: read("MICROSOFT_OAUTH_CLIENT_ID"),
      clientSecret: read("MICROSOFT_OAUTH_CLIENT_SECRET"),
      redirectUri: read("MICROSOFT_OAUTH_REDIRECT_URI"),
      tenant: read("MICROSOFT_OAUTH_TENANT", "common")
    }
  }
};

export function getConfigStatus() {
  const emailTestMode = String(appConfig.emailClient.testMode).toLowerCase() === "true";
  const testingStage = isTestingStage();

  return {
    app: {
      stage: appConfig.app.stage,
      testing: testingStage
    },
    emailClient: {
      provider: appConfig.emailClient.provider || "unset",
      configured: Boolean(appConfig.emailClient.apiKey && appConfig.emailClient.senderEmail && appConfig.emailClient.domain),
      inboundConfigured: Boolean(appConfig.emailClient.inboundDomain),
      testMode: emailTestMode,
      deliveryMode: testingStage || emailTestMode ? "rerouted-to-app-inbox" : "direct-to-vendors",
      testRecipient: trim(appConfig.emailClient.testRecipient) || trim(appConfig.emailClient.replyTo) || trim(appConfig.emailClient.senderEmail) || "unset"
    },
    db: {
      provider: appConfig.db.provider || "unset",
      configured: Boolean(appConfig.db.url)
    },
    ai: {
      provider: appConfig.ai.provider || "unset",
      configured: Boolean(appConfig.ai.apiKey)
    },
    calendar: {
      google: {
        configured: Boolean(appConfig.calendar.google.clientId && appConfig.calendar.google.clientSecret && appConfig.calendar.google.redirectUri)
      },
      microsoft: {
        configured: Boolean(appConfig.calendar.microsoft.clientId && appConfig.calendar.microsoft.clientSecret && appConfig.calendar.microsoft.redirectUri)
      }
    }
  };
}
