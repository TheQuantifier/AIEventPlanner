import { useEffect, useRef, useState } from "react";

const apiBaseUrl = __API_BASE_URL__;
const authStorageKey = "aieventplanner.authToken";

const emptyForm = {
  brief: "",
  budget: "",
  location: "",
  dates: "",
  theme: "",
  guestCount: ""
};

const emptyAuthForm = {
  identifier: "",
  email: "",
  fullName: "",
  password: "",
  token: ""
};

const emptyProfileForm = {
  fullName: "",
  email: "",
  organization: ""
};

const emptyPasswordSettingsForm = {
  newPassword: "",
  code: ""
};

const emptyDeleteSettingsForm = {
  code: ""
};

const emptyContactForm = {
  email: "",
  message: ""
};

const emptyCalendarEventForm = {
  title: "Event hold",
  start: "",
  end: "",
  timeZone: "",
  description: "",
  location: "",
  accountIds: [],
  planId: ""
};

const publicPagePaths = {
  landing: "/",
  login: "/login",
  register: "/register",
  forgot: "/forgot-password",
  reset: "/reset-password",
  privacy: "/privacy",
  terms: "/terms",
  pricing: "/pricing"
};

const privacySections = [
  {
    heading: "Information we collect",
    paragraphs: [
      "AI Event Planner collects the information you provide directly to us, including account details such as your name, email address, organization, login credentials, and profile settings.",
      "We also collect the event-planning information you enter into the app, such as event briefs, budgets, dates, guest counts, vendor selections, outreach content, and related planning notes."
    ]
  },
  {
    heading: "How we use information",
    paragraphs: [
      "We use your information to operate the service, create and manage your account, generate event-planning recommendations, send planning-related communications, provide customer support, and maintain the security of the platform.",
      "If you connect third-party calendar services such as Google Calendar, we use the granted access only to show availability, create or update holds you request, and support the calendar workflows available inside the app."
    ]
  },
  {
    heading: "Sharing and service providers",
    paragraphs: [
      "We may share information with service providers that help us host the app, process email, support authentication, and run core infrastructure on our behalf. Those providers may access information only as needed to perform those services.",
      "We do not sell your personal information. We may disclose information if required by law, to enforce our terms, or to protect the rights, safety, and security of our users or the service."
    ]
  },
  {
    heading: "Data retention and security",
    paragraphs: [
      "We retain information for as long as needed to provide the service, comply with legal obligations, resolve disputes, and enforce agreements. You may request account deletion through the settings tools provided in the app.",
      "We use reasonable administrative, technical, and organizational measures to protect information, but no system can guarantee absolute security."
    ]
  },
  {
    heading: "Your choices",
    paragraphs: [
      "You may update profile information inside your account, disconnect linked calendar providers, or request account deletion. If you no longer want us to process your data for service use, you should stop using the service and delete your account.",
      "Questions about this policy can be directed to the contact email address you publish for your app or business operations."
    ]
  }
];

const termsSections = [
  {
    heading: "Use of the service",
    paragraphs: [
      "AI Event Planner provides software tools to help users organize events, research vendor options, draft outreach, and manage planning workflows. You may use the service only in compliance with applicable law and these terms.",
      "You are responsible for the accuracy of the information you submit, the actions you take based on app outputs, and the communications you send through or with the help of the service."
    ]
  },
  {
    heading: "Accounts and access",
    paragraphs: [
      "You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account. You must notify the service operator promptly if you believe your account has been accessed without authorization.",
      "We may suspend or terminate access if we reasonably believe your use violates these terms, creates security risk, or harms the service or other users."
    ]
  },
  {
    heading: "Third-party services",
    paragraphs: [
      "The service may integrate with third-party products, including calendar providers and email-related services. Your use of those third-party services is subject to their own terms and privacy policies.",
      "We are not responsible for third-party systems, downtime, or policy changes, even when those services are connected to the app."
    ]
  },
  {
    heading: "Disclaimers",
    paragraphs: [
      "The service is provided on an as-is and as-available basis. Planning suggestions, vendor matches, timelines, and generated content are provided for convenience and should be reviewed by you before use.",
      "To the maximum extent permitted by law, we disclaim warranties of merchantability, fitness for a particular purpose, non-infringement, and uninterrupted or error-free operation."
    ]
  },
  {
    heading: "Liability and updates",
    paragraphs: [
      "To the maximum extent permitted by law, the service operator will not be liable for indirect, incidental, special, consequential, or punitive damages, or for loss of profits, revenue, data, or business opportunities arising from your use of the service.",
      "We may update these terms from time to time. Continued use of the service after an update becomes effective constitutes acceptance of the revised terms."
    ]
  }
];

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

function formatBudgetInput(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? `$${numeric.toLocaleString()}` : "";
}

function toLocalDateTimeInput(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function toIsoFromLocalInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function guessTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function getUserInitials(user) {
  const fullNameParts = String(user?.fullName || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (fullNameParts.length >= 2) {
    return `${fullNameParts[0][0] || ""}${fullNameParts[fullNameParts.length - 1][0] || ""}`.toUpperCase();
  }

  if (fullNameParts.length === 1 && fullNameParts[0]) {
    return (fullNameParts[0][0] || "U").toUpperCase();
  }

  const fallbackParts = String(user?.username || user?.email || "")
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean);

  if (fallbackParts.length >= 2) {
    return `${fallbackParts[0][0] || ""}${fallbackParts[fallbackParts.length - 1][0] || ""}`.toUpperCase();
  }

  const fallback = String(user?.username || user?.email || "U")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2);

  return fallback.toUpperCase() || "U";
}

function formatAccountTypeLabel(value) {
  return toTitleCase(String(value || "free").replace(/-/g, " "));
}

async function requestJson(url, options = {}, fallbackMessage = "Request failed") {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || payload.details || fallbackMessage);
  }

  return payload;
}

function sortPlans(plans) {
  return [...plans].sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function getProgressLabel(plan) {
  if (plan.isPaused) return "Paused";

  const labels = {
    "awaiting-user-selection": "Plan ready",
    "vendor-inquiries-sent": "Outreach running",
    "vendor-confirmed": "Confirmed"
  };

  return labels[plan.workflowState] || "Draft";
}

function getActionStatus(plan) {
  if (plan.isPaused) {
    return { tone: "muted", label: "Paused", detail: "Workflow is paused until resumed." };
  }

  if (plan.finalSelection) {
    return { tone: "good", label: "Stable", detail: "Vendor selected and confirmation prepared." };
  }

  if ((plan.communication?.outboundMessages || []).length === 0) {
    return { tone: "warn", label: "Action needed", detail: "Review the plan and start outreach." };
  }

  const replies = plan.automation?.vendorRepliesReceived || 0;
  if (replies === 0) {
    return { tone: "warn", label: "Action needed", detail: "Waiting on vendors; follow-up may be needed." };
  }

  return {
    tone: "good",
    label: "In progress",
    detail: `${replies} vendor reply${replies === 1 ? "" : "ies"} recorded.`
  };
}

function summarizePlan(plan) {
  return [plan.event?.type || "event", plan.event?.location || "Flexible", plan.event?.dateWindow || "Flexible dates"]
    .filter(Boolean)
    .join(" | ");
}

function toTitleCase(value) {
  return String(value || "")
    .trim()
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function getEventDisplayName(plan) {
  if (plan?.event?.title) {
    return plan.event.title;
  }

  const typeLabels = {
    wedding: "Wedding",
    birthday: "Birthday Celebration",
    fundraiser: "Fundraiser",
    retreat: "Retreat",
    "product-launch": "Product Launch",
    corporate: "Corporate Event",
    anniversary: "Anniversary Celebration",
    "baby-shower": "Baby Shower",
    conference: "Conference",
    graduation: "Graduation Celebration",
    "custom-event": "Event Experience"
  };

  const location = plan?.event?.location && plan.event.location !== "Flexible" ? toTitleCase(plan.event.location) : "";
  const theme = String(plan?.event?.theme || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => toTitleCase(part))
    .join(" ");
  const type = typeLabels[plan?.event?.type] || toTitleCase(plan?.event?.type || "Event");

  return [location, theme, type].filter(Boolean).join(" ");
}

function eventFormFromPlan(plan) {
  return {
    brief: plan.event?.brief || "",
    budget: formatBudgetInput(plan.event?.budget),
    location: plan.event?.location || "",
    dates: plan.event?.dateWindow || "",
    theme: plan.event?.theme || "",
    guestCount: String(plan.event?.guestCount || "")
  };
}

function buildEditorIntakeFromPlan(plan, assistantMessage = "Recommendations refreshed from the latest event details.") {
  return {
    eventType: plan?.event?.type || "",
    readiness: "ready-for-research",
    missingFields: [],
    followUpQuestions: [],
    suggestions: plan?.event?.suggestions || [],
    assistantMessage
  };
}

function inferLocalEventType(brief) {
  const text = String(brief || "").trim().toLowerCase();

  if (text.includes("wedding")) return "wedding";
  if (text.includes("birthday")) return "birthday";
  if (text.includes("fundraiser")) return "fundraiser";
  if (text.includes("retreat")) return "retreat";
  if (text.includes("launch")) return "product-launch";
  if (text.includes("corporate") || text.includes("team")) return "corporate";
  if (text.includes("anniversary")) return "anniversary";
  if (text.includes("baby shower")) return "baby-shower";
  if (text.includes("conference")) return "conference";
  if (text.includes("graduation")) return "graduation";

  return "custom-event";
}

function buildLocalIntake(payload) {
  const normalized = {
    brief: String(payload?.brief || "").trim(),
    budget: String(payload?.budget || "").trim(),
    location: String(payload?.location || "").trim(),
    dates: String(payload?.dates || "").trim(),
    guestCount: String(payload?.guestCount || "").trim(),
    theme: String(payload?.theme || "").trim()
  };
  const eventType = inferLocalEventType(normalized.brief);
  const missingFields = [
    ["brief", "What kind of event are you planning?"],
    ["budget", "What budget range should I design around?"],
    ["location", "Which city or area should I focus on?"],
    ["dates", "What dates are you considering, or are they flexible?"],
    ["guestCount", "How many guests should I plan for?"]
  ]
    .filter(([field]) => !normalized[field])
    .map(([field, question]) => ({ field, question }));

  return {
    eventType,
    readiness: missingFields.length === 0 ? "ready-for-research" : "needs-more-detail",
    missingFields: missingFields.map((item) => item.field),
    followUpQuestions: missingFields,
    suggestions: missingFields.length === 0
      ? [
          normalized.theme ? `Theme noted: ${normalized.theme}` : "Theme is optional, but adding one can sharpen recommendations.",
          "Save to let the AI review the brief and refine the event direction."
        ]
      : [
          "Fill in the missing basics first so the AI can give better planning guidance immediately."
        ],
    assistantMessage: missingFields.length === 0
      ? "The basics are covered. Save in the workspace for an AI pass and a more specific event direction."
      : "Before the AI reviews this event, fill in the missing basics below."
  };
}

function buildPlanSummary(plan) {
  return [
    ["Event", plan.event.type],
    ["Theme", plan.event.theme || "Open"],
    ["Budget", formatBudgetInput(plan.event.budget)],
    ["Where", plan.event.location],
    ["When", plan.event.dateWindow],
    ["Guests", plan.event.guestCount]
  ];
}

function getSelectedVendorCategories(plan) {
  const configured = (plan?.vendorCategories || []).filter((category) => category.selected);
  if (configured.length > 0) {
    return configured;
  }

  const derivedKeys = Array.from(new Set((plan?.shortlist || []).map((vendor) => vendor.category).filter(Boolean)));
  return derivedKeys.map((key) => ({
    key,
    label: toTitleCase(String(key).replace(/-/g, " ")),
    description: "",
    selected: true
  }));
}

function groupVendorsByCategory(plan) {
  const categories = getSelectedVendorCategories(plan);
  const vendors = Array.isArray(plan?.shortlist) ? plan.shortlist : [];

  return categories.map((category) => ({
    ...category,
    vendors: vendors.filter((vendor) => vendor.category === category.key)
  }));
}

function formatThemeLine(event) {
  return event?.theme ? `Style / theme: ${event.theme}` : "";
}

function formatEventLabel(event) {
  return event?.title || event?.type || "event";
}

function joinEmailLines(lines) {
  return lines.filter((line) => line !== undefined && line !== null).join("\n");
}

function getPublicPageFromLocation() {
  const { pathname, search } = window.location;
  const resetToken = new URLSearchParams(search).get("resetToken");

  if (resetToken || pathname === publicPagePaths.reset) {
    return "reset";
  }

  switch (pathname) {
    case publicPagePaths.login:
      return "login";
    case publicPagePaths.register:
      return "register";
    case publicPagePaths.forgot:
      return "forgot";
    case publicPagePaths.privacy:
      return "privacy";
    case publicPagePaths.terms:
      return "terms";
    case publicPagePaths.pricing:
      return "pricing";
    default:
      return "landing";
  }
}

function getAuthModeFromPublicPage(page) {
  return ["login", "register", "forgot", "reset"].includes(page) ? page : "login";
}

function getOAuthResultFromLocation() {
  const params = new URLSearchParams(window.location.search);
  return {
    token: params.get("token") || "",
    error: params.get("oauthError") || "",
    success: params.get("oauth") === "success"
  };
}

function PublicLegalLinks({ onNavigate, compact = false }) {
  return (
    <nav className={`public-legal-links ${compact ? "compact" : ""}`} aria-label="Legal">
      <button type="button" className="text-link" onClick={() => onNavigate("privacy")}>Privacy Policy</button>
      <button type="button" className="text-link" onClick={() => onNavigate("terms")}>Terms of Use</button>
    </nav>
  );
}

function FooterLinks({ onNavigate, onContact }) {
  return (
    <nav className="public-legal-links" aria-label="Footer">
      <button type="button" className="text-link" onClick={() => onNavigate("pricing")}>Pricing</button>
      <button type="button" className="text-link" onClick={() => onNavigate("privacy")}>Privacy Policy</button>
      <button type="button" className="text-link" onClick={() => onNavigate("terms")}>Terms of Use</button>
      <button type="button" className="text-link" onClick={onContact}>Contact us</button>
    </nav>
  );
}

function PricingPage({ onOpenContactModal }) {
  const featureRows = [
    {
      label: "Price",
      values: ["$0.00/month", "$10.00/month", "Special"]
    },
    {
      label: "Event size",
      values: ["Small to mid-size events", "Small to mid-size events", "All size events"]
    },
    {
      label: "AI plan creation",
      values: ["Included", "Included", "Included"]
    },
    {
      label: "Vendor search",
      values: ["Included", "Included", "Included"]
    },
    {
      label: "Automated vendor\ncommunications",
      values: ["3 full events with automated outreach, then draft-only support", "Unlimited", "Unlimited"]
    },
    {
      label: "Automated price\nnegotiations",
      values: ["1 full event with automated negotiation", "Unlimited", "Unlimited"]
    },
    {
      label: "Best fit",
      values: ["Birthdays, dinners, showers, and casual gatherings", "Independent planners and repeat event hosts", "Weddings, corporate outings, retreats, and high-touch event operations"]
    }
  ];

  const plans = [
    {
      name: "Free",
      kicker: "No payment information needed",
      description: "Start planning right away and run your first event through the full workflow."
    },
    {
      name: "Pro",
      kicker: "For active planners",
      description: "Unlock unlimited vendor outreach and negotiations for ongoing event work."
    },
    {
      name: "Business",
      kicker: "For high-touch events",
      description: "Everything in Pro, expanded for both small events and large-format productions."
    }
  ];

  return (
    <section className="pricing-page">
      <section className="panel pricing-hero">
        <p className="section-kicker">Pricing</p>
        <h2>Choose the plan that fits how you plan.</h2>
        <p className="landing-lead">Start free, explore the full event-planning flow, and scale into unlimited outreach and negotiation when you need more.</p>
      </section>

      <section className="pricing-grid">
        {plans.map((plan) => (
          <article key={plan.name} className="panel pricing-plan-card">
            <p className="section-kicker">{plan.kicker}</p>
            <h3>{plan.name}</h3>
            <p className="fine-print">{plan.description}</p>
          </article>
        ))}
      </section>

      <section className="panel pricing-compare">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Plan comparison</p>
            <h3>What changes as you grow</h3>
          </div>
        </div>
        <div className="pricing-table" role="table" aria-label="Pricing comparison">
          <div className="pricing-row pricing-row-head" role="row">
            <div className="pricing-cell pricing-feature-cell" role="columnheader">Feature</div>
            <div className="pricing-cell" role="columnheader">Free</div>
            <div className="pricing-cell" role="columnheader">Pro</div>
            <div className="pricing-cell" role="columnheader">Business</div>
          </div>
          {featureRows.map((row) => (
            <div key={row.label} className={`pricing-row ${row.label === "Event size" ? "pricing-row-section-start" : ""}`} role="row">
              <div className="pricing-cell pricing-feature-cell" role="rowheader">{row.label.split("\n").map((part) => <span key={part}>{part}</span>)}</div>
              {row.values.map((value, valueIndex) => (
                <div key={`${row.label}-${valueIndex}`} className="pricing-cell" role="cell">
                  <span className="pricing-cell-text">
                    {row.label === "Price" && valueIndex === 2 ? (
                      <>
                        Special<sup className="pricing-asterisk">*</sup>
                      </>
                    ) : (row.label === "Automated vendor\ncommunications" || row.label === "Automatic price\nnegotiations") && valueIndex === 0 ? (
                      <>
                        {value}
                        <sup className="pricing-asterisk">**</sup>
                      </>
                    ) : (
                      value
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <p className="fine-print pricing-footnote">
          <span className="pricing-asterisk">*</span> Business pricing depends on the business or entity and can be negotiable.
          {" "}To get more information or setup a meeting to discuss pricing,{" "}
          <button type="button" className="text-link inline-text-link" onClick={onOpenContactModal}>contact us</button>.
        </p>
        <p className="fine-print pricing-footnote">
          <span className="pricing-asterisk">**</span> An event is considered locked in once <strong>Contact vendors</strong> or <strong>Select vendors</strong> is pressed.
          You can cancel and still use your free vendor outreaches and negotiation access on other events before pressing <strong>Contact vendors</strong> or <strong>Select vendors</strong>.
        </p>
      </section>
    </section>
  );
}

function LegalPage({ title, summary, sections, onNavigate }) {
  return (
    <section className="legal-page panel">
      <p className="section-kicker">Legal</p>
      <h2>{title}</h2>
      <p className="fine-print legal-summary">{summary}</p>
      <div className="legal-sections">
        {sections.map((section) => (
          <section key={section.heading} className="legal-section">
            <h3>{section.heading}</h3>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}
      </div>
      <PublicLegalLinks onNavigate={onNavigate} compact />
    </section>
  );
}

function ConsentModal({ documentKey, onAgree, onDisagree }) {
  const isPrivacy = documentKey === "privacy";
  const title = isPrivacy ? "Privacy Policy" : "Terms of Use";
  const summary = isPrivacy
    ? "Review and accept the Privacy Policy to continue registration."
    : "Review and accept the Terms of Use to continue registration.";
  const sections = isPrivacy ? privacySections : termsSections;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel panel" role="dialog" aria-modal="true" aria-labelledby="consent-modal-title">
        <p className="section-kicker">Registration Consent</p>
        <h2 id="consent-modal-title">{title}</h2>
        <p className="fine-print legal-summary">{summary}</p>
        <div className="legal-sections modal-legal-sections">
          {sections.map((section) => (
            <section key={section.heading} className="legal-section">
              <h3>{section.heading}</h3>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </section>
          ))}
        </div>
        <div className="action-row modal-actions">
          <button type="button" className="secondary" onClick={onDisagree}>I disagree</button>
          <button type="button" onClick={onAgree}>I agree</button>
        </div>
      </div>
    </div>
  );
}

function ContactModal({ formData, busy, message, onChange, onClose, onSubmit }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal-panel panel contact-modal-panel" role="dialog" aria-modal="true" aria-labelledby="contact-modal-title">
        <p className="section-kicker">Contact</p>
        <h2 id="contact-modal-title">Contact us</h2>
        <p className="fine-print">Send a message and we will route it to the team.</p>
        {message ? <p className="fine-print">{message}</p> : null}
        <form className="planner-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input name="email" value={formData.email} onChange={onChange} placeholder="you@example.com" autoComplete="email" />
          </label>
          <label className="field">
            <span>Message</span>
            <textarea name="message" value={formData.message} onChange={onChange} placeholder="How can we help?" />
          </label>
          <div className="action-row modal-actions">
            <button type="button" className="secondary" onClick={onClose} disabled={busy}>Close</button>
            <button type="submit" disabled={busy || !formData.message.trim()}>{busy ? "Sending..." : "Send message"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PasswordField({ name, value, onChange, placeholder, autoComplete, visible, onToggle }) {
  return (
    <label className="field">
      <span>Password</span>
      <div className="password-field-wrap">
        <input
          name={name}
          type={visible ? "text" : "password"}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="password-toggle"
          onClick={onToggle}
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M3 3 21 21M10.6 10.7a2 2 0 0 0 2.7 2.7M9.9 5.2A10.9 10.9 0 0 1 12 5c5.3 0 9.3 4.1 10 7-.3 1.2-1.2 2.8-2.6 4.2M14.1 18.8c-.7.1-1.4.2-2.1.2-5.3 0-9.3-4.1-10-7 .4-1.7 1.9-4.2 4.4-5.8M12 9.5A2.5 2.5 0 0 1 14.5 12"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                d="M2 12c.7-2.9 4.7-7 10-7s9.3 4.1 10 7c-.7 2.9-4.7 7-10 7S2.7 14.9 2 12Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle
                cx="12"
                cy="12"
                r="2.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              />
            </svg>
          )}
        </button>
      </div>
    </label>
  );
}

function buildInquiryPreview(event, vendor) {
  const eventLabel = formatEventLabel(event);

  return {
    to: vendor.email,
    subject: `Availability request: ${eventLabel}`,
    body: joinEmailLines([
      `Hello ${vendor.name},`,
      "",
      "",
      `I'm reaching out regarding a potential ${eventLabel}. We would love to learn whether your team is a fit for this event.`,
      "",
      "",
      "Event details:",
      `Event: ${eventLabel}`,
      `Location: ${event.location}`,
      `Dates: ${event.dateWindow}`,
      `Guest count: ${event.guestCount}`,
      `Budget target: ${event.budgetLabel}`,
      formatThemeLine(event),
      "",
      "",
      "If available, please share:",
      "1. Your availability for the requested date range",
      "2. Relevant package or service options",
      "3. Estimated pricing or starting range",
      "4. Any requirements, constraints, or next steps we should know about",
      "",
      "",
      "A short reply is fine. We are mainly trying to confirm fit, availability, and budget alignment.",
      "",
      "",
      "Best,",
      "AI Event Planner"
    ])
  };
}

function DashboardSection({ plans, onEdit, onPause, onDelete }) {
  const needsActionCount = plans.filter((plan) => getActionStatus(plan).label === "Action needed").length;
  const pausedCount = plans.filter((plan) => plan.isPaused).length;

  return (
    <div className="panel dashboard-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Dashboard</p>
          <h2>Tracked events</h2>
        </div>
      </div>
      <div className="dashboard-summary">
        <div className="metric-card">
          <span className="metric-label">Total events</span>
          <strong>{plans.length}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Need action</span>
          <strong>{needsActionCount}</strong>
        </div>
        <div className="metric-card">
          <span className="metric-label">Paused</span>
          <strong>{pausedCount}</strong>
        </div>
      </div>
      <div className="events-dashboard">
        {plans.length === 0 ? (
          <div className="dashboard-empty">
            <strong>No tracked events yet.</strong>
            <p>Create an event plan to populate the dashboard.</p>
          </div>
        ) : (
          plans.map((plan) => {
            const action = getActionStatus(plan);

            return (
              <article key={plan.id} className="event-row">
                <div className="event-main">
                  <div className="event-title-row">
                    <strong>{getEventDisplayName(plan)}</strong>
                    <span className="table-pill">{getProgressLabel(plan)}</span>
                  </div>
                  <div className="event-meta">{summarizePlan(plan)}</div>
                </div>
                <div className="event-status">
                  <span className={`table-status table-status-${action.tone}`}>{action.label}</span>
                  <span className="event-detail">{action.detail}</span>
                </div>
                <div className="event-actions">
                  <button type="button" className="icon-button secondary" onClick={() => onEdit(plan)} aria-label="Edit event">&#128221;</button>
                  <button type="button" className="icon-button secondary" onClick={() => onPause(plan)} aria-label={plan.isPaused ? "Resume event" : "Pause event"}>&#9208;</button>
                  <button type="button" className="icon-button secondary danger" onClick={() => onDelete(plan)} aria-label="Delete event">&#128465;</button>
                </div>
              </article>
            );
          })
        )}
      </div>
    </div>
  );
}

function SharedComposer({
  mode,
  formData,
  onChange,
  onSubmit,
  onResetEdit,
  onAdvance,
  editingPlanId,
  currentPlan,
  analyzing,
  savingPlan,
  intake
}) {
  const textareaRef = useRef(null);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [formData.brief]);

  return (
    <section className={`panel shared-composer ${mode === "workspace" ? "is-workspace" : "is-home"}`}>
      <div className="section-heading">
        <div>
          <p className="section-kicker">{mode === "workspace" ? "Event workspace" : "Create event"}</p>
          <h2>{mode === "workspace" ? "Refine the event brief" : "Start with the event idea"}</h2>
        </div>
        {mode === "workspace" && editingPlanId ? <div className="editor-state">Editing {getEventDisplayName(currentPlan) || "event"}</div> : null}
      </div>
      <form className="planner-form" onSubmit={onSubmit}>
        <label className="field field-large">
          <span>What are you planning?</span>
          <textarea
            ref={textareaRef}
            name="brief"
            value={formData.brief}
            onChange={onChange}
            placeholder="Example: I want a stylish company dinner for 80 people in Chicago this fall."
          />
        </label>
        <div className={`composer-expanded ${mode === "workspace" ? "is-visible" : ""}`}>
          <div className="grid">
            <label className="field"><span>Budget</span><input name="budget" value={formData.budget} onChange={onChange} placeholder="$12,000" /></label>
            <label className="field"><span>Location</span><input name="location" value={formData.location} onChange={onChange} placeholder="Chicago" /></label>
            <label className="field"><span>Dates</span><input name="dates" value={formData.dates} onChange={onChange} placeholder="June 10 to June 14" /></label>
            <label className="field"><span>Theme</span><input name="theme" value={formData.theme} onChange={onChange} placeholder="Minimal, garden party, modern luxury" /></label>
            <label className="field"><span>Guest count</span><input name="guestCount" type="number" min="1" value={formData.guestCount} onChange={onChange} placeholder="100" /></label>
          </div>
        </div>
        <div className="action-row">
          <button type="submit" disabled={(mode === "home" ? analyzing : (savingPlan || analyzing)) || !formData.brief.trim()}>
            {mode === "home" ? (analyzing ? "Analyzing..." : "Get ideas") : (savingPlan ? "Saving..." : analyzing ? "Analyzing..." : "Save updates")}
          </button>
          {mode === "workspace" && editingPlanId ? (
            <button type="button" className="secondary" onClick={onResetEdit} disabled={savingPlan || analyzing}>Cancel edit</button>
          ) : null}
          {mode === "workspace" && currentPlan && intake?.readiness === "ready-for-research" ? (
            <button type="button" className="secondary" disabled={savingPlan || analyzing} onClick={onAdvance}>
              Continue to plan
            </button>
          ) : null}
          {mode === "home" ? (
            <span className="composer-hint">The workspace opens after initial input.</span>
          ) : null}
          {mode === "workspace" ? (
            <span className="composer-hint">Update the brief here and keep working through the steps below.</span>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function IntakeSection({ intake, analyzing }) {
  return (
    <>
      {analyzing ? (
        <section className="panel">
          <h2>Next details</h2>
          <div className="follow-up-list">
            <div className="follow-up-item thinking-state">
              <strong>
                Thinking<span className="loading-dots" aria-hidden="true">...</span>
              </strong>
              <br />
              Generating intake guidance from your event brief.
            </div>
          </div>
        </section>
      ) : intake ? (
        <section className="panel">
          <h2>Next details</h2>
          <div className="follow-up-list">
            {intake.followUpQuestions.length === 0
              ? <div className="follow-up-item">All required intake details are present. You can continue to event direction.</div>
              : intake.followUpQuestions.map((item) => (
                  <div key={`${item.field}-${item.question}`} className="follow-up-item">
                    <strong>{item.field}</strong><br />{item.question}
                  </div>
                ))}
          </div>
        </section>
      ) : (
        <section className="panel">
          <h2>Start with the brief</h2>
          <p>Capture the event idea above to generate intake guidance and move into the planning flow.</p>
        </section>
      )}
    </>
  );
}

function DirectionSection({ plan, intake, onShowVendors, onToggleVendorCategory, categorySaving }) {
  if (!plan) return null;

  return (
    <section className="results">
      {intake ? (
        <div className="panel">
          <h2>Planner notes</h2>
          <div className="summary"><p>{intake.assistantMessage}</p></div>
          <div className="suggestions">
            <span className="chip">Detected event type: {intake.eventType}</span>
            {intake.suggestions.map((item) => <span key={item} className="chip">{item}</span>)}
          </div>
        </div>
      ) : null}
      <div className="panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Event direction</p>
            <h2>Your event direction</h2>
          </div>
          <div className="editor-state">Edit details below to refine recommendations.</div>
        </div>
        <div className="summary">
          {buildPlanSummary(plan).map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}
          {plan.event.plannerSummary ? <p>{plan.event.plannerSummary}</p> : null}
        </div>
        {Array.isArray(plan.vendorCategories) && plan.vendorCategories.length > 0 ? (
          <div className="vendor-category-plan">
            <h3>Suggested vendor types</h3>
            <div className="vendor-category-list">
              {plan.vendorCategories.map((category) => (
                <label key={category.key} className="vendor-category-item">
                  <input
                    type="checkbox"
                    checked={Boolean(category.selected)}
                    disabled={categorySaving}
                    onChange={(event) => onToggleVendorCategory(category.key, event.target.checked)}
                  />
                  <span>
                    <strong>{category.label}</strong>
                    <small>{category.description}</small>
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {plan.event.suggestions?.length ? <div className="suggestions">{plan.event.suggestions.map((item) => <span key={item} className="chip">{item}</span>)}</div> : null}
        <div className="direction-notes">
          <div className="follow-up-item">Use the shared composer above to refine the event brief and save updates.</div>
        </div>
        <div className="action-row section-actions direction-actions">
          <button type="button" className="secondary" onClick={onShowVendors}>
            See vendors
          </button>
        </div>
      </div>
    </section>
  );
}

function MatchesSection({ plan, user, message, onFinalizeVendor, onSendInquiries, sendingInquiries }) {
  if (!plan) return null;
  const vendorGroups = groupVendorsByCategory(plan);
  const inquiries = plan.communication?.outboundMessages?.filter((message) => message.type === "inquiry") || [];
  const alreadySent = inquiries.length > 0;
  const hasUsageLimits = user?.accountType === "free" || user?.accountType === "test";
  const usageLabel = user?.accountType === "test" ? "Test plan usage" : "Free plan usage";

  return (
    <section className="results">
      <div className="panel">
        <h2>Recommended matches</h2>
        {hasUsageLimits ? (
          <p className="fine-print">
            {usageLabel}: {user.automatedOutreachEventsRemaining} automated outreach event{user.automatedOutreachEventsRemaining === 1 ? "" : "s"} left.{" "}
            {user.automatedNegotiationEventsRemaining} automated price negotiation event{user.automatedNegotiationEventsRemaining === 1 ? "" : "s"} left.
          </p>
        ) : null}
        {message ? <p className="fine-print">{message}</p> : null}
        <div className="action-row section-actions matches-actions">
          <button type="button" disabled={plan.isPaused || alreadySent || sendingInquiries} onClick={onSendInquiries}>
            {plan.isPaused ? "Event paused" : sendingInquiries ? "Sending inquiries..." : alreadySent ? "Outreach already handled" : "Start outreach"}
          </button>
        </div>
        {vendorGroups.length === 0 ? (
          <div className="follow-up-item">No recommended matches yet. Save the event direction to generate options.</div>
        ) : (
          <div className="vendor-groups">
            {vendorGroups.map((group) => (
              <section key={group.key} className="vendor-group-card">
                <div className="vendor-group-header">
                  <div>
                    <p className="eyebrow">{group.label}</p>
                    <h3>{group.description || `Top ${group.label.toLowerCase()} options`}</h3>
                  </div>
                  <span className="topbar-badge">{group.vendors.length} option{group.vendors.length === 1 ? "" : "s"}</span>
                </div>
                <div className="vendor-group-scroll">
                  {group.vendors.length === 0 ? (
                    <div className="follow-up-item">No vendors found for this category yet.</div>
                  ) : (
                    group.vendors.map((vendor) => {
                      const inquiryPreview = buildInquiryPreview(plan.event, vendor);
                      return (
                        <article key={vendor.id} className="vendor-card">
                          <div className="vendor-topline">
                            <div><p className="eyebrow">Option {vendor.rank}</p><h3>{vendor.name}</h3></div>
                            <div className="vendor-price-block"><strong>{currency(vendor.estimatedQuote)}</strong><span className={`status-pill status-${vendor.status}`}>{vendor.status}</span></div>
                          </div>
                          <div className="vendor-meta"><span>{vendor.category}</span><span>{vendor.serviceArea.join(", ")}</span><span>{vendor.rating}/5</span><span>Score {vendor.score}</span></div>
                          <p>{vendor.summary}</p>
                          <p className="fine-print">Primary contact: {vendor.email}</p>
                          <details className="email-preview">
                            <summary>Preview inquiry email</summary>
                            <p className="fine-print">To: {inquiryPreview.to}</p>
                            <p className="fine-print">Subject: {inquiryPreview.subject}</p>
                            <pre>{inquiryPreview.body}</pre>
                          </details>
                          <button type="button" disabled={plan.finalSelection?.vendorId === vendor.id || plan.isPaused} onClick={() => onFinalizeVendor(vendor.id)}>
                            {plan.finalSelection?.vendorId === vendor.id ? "Chosen" : "Choose this option"}
                          </button>
                        </article>
                      );
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CommunicationSection({ plan }) {
  if (!plan) return null;

  const outboundMessages = plan.communication?.outboundMessages || [];
  const inboundMessages = plan.communication?.inboundMessages || [];

  return (
    <section className="results">
      <div className="panel">
        <h2>Communication log</h2>
        <div className="follow-up-list">
          {outboundMessages.length ? outboundMessages.map((message) => {
            const vendorName = plan.shortlist.find((vendor) => vendor.id === message.vendorId)?.name || message.vendorId || "Vendor";
            return (
              <div key={message.id} className="follow-up-item">
                <strong>{message.type === "confirmation" ? "Confirmation" : "Inquiry"} | {vendorName}</strong><br />
                {message.subject || "No subject"}<br />
                <span className="fine-print">{formatDate(message.createdAt)}</span><br />
                <span className="fine-print">Delivered to: {message.delivery?.deliveredTo || message.deliveredTo || "not sent"}</span>
                {message.delivery?.intendedRecipient && message.delivery?.intendedRecipient !== message.delivery?.deliveredTo ? <><br /><span className="fine-print">Intended vendor: {message.delivery.intendedRecipient}</span></> : null}
              </div>
            );
          }) : <div className="follow-up-item">No outbound email has been sent yet.</div>}
        </div>
        <div className="follow-up-list">
          {inboundMessages.length ? inboundMessages.map((message) => {
            const vendorName = plan.shortlist.find((vendor) => vendor.id === message.vendorId)?.name || message.from || "Unknown sender";
            return <div key={message.id} className="follow-up-item"><strong>Reply | {vendorName}</strong><br />{message.subject || "No subject"}<br /><span className="fine-print">{formatDate(message.receivedAt)}</span><p>{message.text || "No message body supplied."}</p></div>;
          }) : <div className="follow-up-item">No vendor replies have been recorded yet.</div>}
        </div>
      </div>
      {plan.finalSelection ? (
        <div className="panel">
          <h2>Selection saved</h2>
          <p>{plan.finalSelection.vendorName || "Your chosen option"} is marked as the preferred fit for this event.</p>
          <p className="fine-print">Confirmation created {formatDate(plan.finalSelection.selectedAt)}.</p>
        </div>
      ) : null}
    </section>
  );
}

function AccountPanel({
  view,
  user,
  profileForm,
  profileSaving,
  profileMessage,
  onProfileChange,
  onProfileSave,
  passwordForm,
  passwordBusy,
  passwordMessage,
  onPasswordChange,
  onPasswordRequest,
  onPasswordConfirm,
  deleteForm,
  deleteBusy,
  deleteMessage,
  onDeleteChange,
  onDeleteRequest,
  onDeleteConfirm,
  calendarState
}) {
  if (view === "profile") {
    return (
      <section className="panel account-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Profile</p>
            <h2>General information</h2>
          </div>
        </div>
        <form className="planner-form" onSubmit={onProfileSave}>
          <div className="grid">
            <label className="field">
              <span>Name</span>
              <input name="fullName" value={profileForm.fullName} onChange={onProfileChange} placeholder="John Hand" />
            </label>
            <label className="field">
              <span>Email</span>
              <input name="email" value={profileForm.email} onChange={onProfileChange} placeholder="you@example.com" />
            </label>
            <label className="field">
              <span>Organization</span>
              <input name="organization" value={profileForm.organization} onChange={onProfileChange} placeholder="Manus Web Works" />
            </label>
          </div>
          {profileMessage ? <p className="fine-print">{profileMessage}</p> : null}
          <div className="action-row">
            <button type="submit" disabled={profileSaving}>
              {profileSaving ? "Saving..." : "Save profile"}
            </button>
            <div className="topbar-badge">Username: {user.username}</div>
            <div className="topbar-badge">Plan: {formatAccountTypeLabel(user.accountType)}</div>
          </div>
        </form>
      </section>
    );
  }

  if (view === "settings") {
    return (
      <section className="panel account-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Settings</p>
            <h2>Account security</h2>
          </div>
        </div>
        <div className="account-settings-grid">
          <form className="planner-form account-card" onSubmit={onPasswordRequest}>
            <h3>Change password</h3>
            <p className="fine-print">We will email a temporary verification code to {user.email} before applying the new password.</p>
            <label className="field">
              <span>New password</span>
              <input name="newPassword" type="password" value={passwordForm.newPassword} onChange={onPasswordChange} placeholder="8+ chars, upper, lower, number, symbol" />
            </label>
            <label className="field">
              <span>Verification code</span>
              <input name="code" value={passwordForm.code} onChange={onPasswordChange} placeholder="6-digit code" />
            </label>
            {passwordMessage ? <p className="fine-print">{passwordMessage}</p> : null}
            <div className="action-row">
              <button type="submit" disabled={passwordBusy || !passwordForm.newPassword.trim()}>
                {passwordBusy ? "Sending..." : "Send code"}
              </button>
              <button type="button" className="secondary" disabled={passwordBusy || !passwordForm.code.trim()} onClick={onPasswordConfirm}>
                Confirm password change
              </button>
            </div>
          </form>
          <form className="planner-form account-card" onSubmit={onDeleteRequest}>
            <h3>Delete account</h3>
            <p className="fine-print">This permanently removes your account, plans, replies, sessions, and verification records after email confirmation.</p>
            <label className="field">
              <span>Verification code</span>
              <input name="code" value={deleteForm.code} onChange={onDeleteChange} placeholder="6-digit code" />
            </label>
            {deleteMessage ? <p className="fine-print">{deleteMessage}</p> : null}
            <div className="action-row">
              <button type="submit" className="secondary" disabled={deleteBusy}>
                {deleteBusy ? "Sending..." : "Send delete code"}
              </button>
              <button type="button" className="secondary danger" disabled={deleteBusy || !deleteForm.code.trim()} onClick={onDeleteConfirm}>
                Permanently delete account
              </button>
            </div>
          </form>
        </div>
        <CalendarPanel {...calendarState} />
      </section>
    );
  }

  if (view === "admin") {
    return (
      <section className="panel account-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Admin</p>
            <h2>App settings</h2>
          </div>
        </div>
        <div className="follow-up-list">
          <div className="follow-up-item">
            <strong>Admin settings page</strong>
            <p className="fine-print">This space is reserved for app-level settings and admin controls. Add the settings you want here next.</p>
          </div>
        </div>
      </section>
    );
  }

  return null;
}

export default function App() {
  const [sessionToken, setSessionToken] = useState("");
  const [user, setUser] = useState(null);
  const [publicPage, setPublicPage] = useState(() => getPublicPageFromLocation());
  const [authMode, setAuthMode] = useState(() => getAuthModeFromPublicPage(getPublicPageFromLocation()));
  const [authForm, setAuthForm] = useState(emptyAuthForm);
  const [authLoading, setAuthLoading] = useState(true);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactForm, setContactForm] = useState(emptyContactForm);
  const [contactBusy, setContactBusy] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const [authPasswordVisible, setAuthPasswordVisible] = useState(false);
  const [registerConsentAccepted, setRegisterConsentAccepted] = useState(false);
  const [consentModalStep, setConsentModalStep] = useState("");
  const [consentPreviewMode, setConsentPreviewMode] = useState(false);
  const [dashboardPlans, setDashboardPlans] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [intake, setIntake] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [sendingInquiries, setSendingInquiries] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [activeStep, setActiveStep] = useState(0);
  const [currentPage, setCurrentPage] = useState("home");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [profileForm, setProfileForm] = useState(emptyProfileForm);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordSettingsForm, setPasswordSettingsForm] = useState(emptyPasswordSettingsForm);
  const [passwordSettingsBusy, setPasswordSettingsBusy] = useState(false);
  const [passwordSettingsMessage, setPasswordSettingsMessage] = useState("");
  const [deleteSettingsForm, setDeleteSettingsForm] = useState(emptyDeleteSettingsForm);
  const [deleteSettingsBusy, setDeleteSettingsBusy] = useState(false);
  const [deleteSettingsMessage, setDeleteSettingsMessage] = useState("");
  const [calendarAccounts, setCalendarAccounts] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");
  const [calendarTimeline, setCalendarTimeline] = useState(null);
  const [calendarTimelineLoading, setCalendarTimelineLoading] = useState(false);
  const [calendarRange, setCalendarRange] = useState(() => ({
    start: toLocalDateTimeInput(new Date()),
    end: toLocalDateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))
  }));
  const [calendarEventForm, setCalendarEventForm] = useState(() => ({
    ...emptyCalendarEventForm,
    start: toLocalDateTimeInput(new Date()),
    end: toLocalDateTimeInput(new Date(Date.now() + 2 * 60 * 60 * 1000)),
    timeZone: guessTimeZone()
  }));
  const [calendarEventBusy, setCalendarEventBusy] = useState(false);
  const [calendarEventMessage, setCalendarEventMessage] = useState("");
  const [lastCalendarEventId, setLastCalendarEventId] = useState("");
  const accountMenuRef = useRef(null);
  const analyzeRequestIdRef = useRef(0);
  const saveRequestIdRef = useRef(0);

  function finalizeAuthSession(token, nextUser) {
    window.localStorage.setItem(authStorageKey, token);
    setSessionToken(token);
    setUser(nextUser);
    setAuthForm(emptyAuthForm);
    setDashboardPlans([]);
    setCurrentPlan(null);
    setEditingPlanId(null);
    setWorkspaceMessage("");
    setCurrentPage("home");
    setPublicPage("landing");
    setAuthMode("login");
    setAuthMessage("");
    if (window.location.pathname !== publicPagePaths.landing || window.location.search) {
      window.history.replaceState({}, "", publicPagePaths.landing);
    }
  }

  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get("resetToken");
    const nextPublicPage = getPublicPageFromLocation();
    const oauthResult = getOAuthResultFromLocation();
    const storedToken = window.localStorage.getItem(authStorageKey) || "";

    setPublicPage(nextPublicPage);
    setAuthMode(getAuthModeFromPublicPage(nextPublicPage));

    if (resetToken || nextPublicPage === "reset") {
      setAuthForm((current) => ({ ...current, token: resetToken }));
    }

    if (oauthResult.error) {
      setAuthMessage(oauthResult.error);
      const nextUrl = window.location.pathname;
      window.history.replaceState({}, "", nextUrl);
    }

    if (oauthResult.token) {
      setSessionToken(oauthResult.token);
      loadCurrentUser(oauthResult.token)
        .then((nextUser) => {
          if (nextUser) {
            finalizeAuthSession(oauthResult.token, nextUser);
          } else {
            setAuthMessage("OAuth sign-in completed, but the session could not be loaded.");
            window.history.replaceState({}, "", window.location.pathname);
          }
        })
        .finally(() => setAuthLoading(false));
      return;
    }

    if (!storedToken) {
      setAuthLoading(false);
      return;
    }

    setSessionToken(storedToken);
    loadCurrentUser(storedToken).finally(() => setAuthLoading(false));
  }, []);

  useEffect(() => {
    function handlePopState() {
      const nextPublicPage = getPublicPageFromLocation();
      const oauthResult = getOAuthResultFromLocation();
      setPublicPage(nextPublicPage);
      setAuthMode(getAuthModeFromPublicPage(nextPublicPage));
      setAuthMessage(oauthResult.error || "");
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (!user) {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      if (currentPlan?.id) {
        loadPlan(currentPlan.id);
        return;
      }

      if (currentPage === "home") {
        loadDashboardPlans();
      }
    }, 15000);

    return () => window.clearInterval(intervalId);
  }, [currentPlan?.id, currentPage, user]);

  useEffect(() => {
    if (user) {
      loadDashboardPlans();
    }
  }, [user]);

  useEffect(() => {
    setProfileForm({
      fullName: user?.fullName || "",
      email: user?.email || "",
      organization: user?.organization || ""
    });
  }, [user?.fullName, user?.email, user?.organization]);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const calendarStatus = params.get("calendar");
    const provider = params.get("provider");
    if (calendarStatus === "connected") {
      setCalendarMessage(`Calendar connected${provider ? ` (${provider})` : ""}.`);
      setCurrentPage("settings");
      params.delete("calendar");
      params.delete("provider");
      const nextQuery = params.toString();
      const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
      window.history.replaceState({}, "", nextUrl);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    loadCalendarAccounts();
  }, [user]);

  useEffect(() => {
    if (calendarAccounts.length === 0) {
      return;
    }
    setCalendarEventForm((current) => (
      current.accountIds.length > 0
        ? current
        : { ...current, accountIds: calendarAccounts.map((account) => account.id) }
    ));
  }, [calendarAccounts]);

  useEffect(() => {
    function handleDocumentClick(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    return () => document.removeEventListener("mousedown", handleDocumentClick);
  }, []);

  function resetSessionState() {
    window.localStorage.removeItem(authStorageKey);
    setSessionToken("");
    setUser(null);
    setDashboardPlans([]);
    setCurrentPlan(null);
    setEditingPlanId(null);
    setIntake(null);
    setFormData(emptyForm);
    setWorkspaceMessage("");
    setAuthForm(emptyAuthForm);
    setAuthMessage("");
    setContactModalOpen(false);
    setContactForm(emptyContactForm);
    setContactMessage("");
    setAuthPasswordVisible(false);
    setRegisterConsentAccepted(false);
    setConsentModalStep("");
    setConsentPreviewMode(false);
    setPublicPage("landing");
    setAuthMode("login");
    setCurrentPage("home");
    setActiveStep(0);
    setAccountMenuOpen(false);
    setProfileForm(emptyProfileForm);
    setPasswordSettingsForm(emptyPasswordSettingsForm);
    setPasswordSettingsMessage("");
    setDeleteSettingsForm(emptyDeleteSettingsForm);
    setDeleteSettingsMessage("");
    if (window.location.pathname !== publicPagePaths.landing || window.location.search) {
      window.history.replaceState({}, "", publicPagePaths.landing);
    }
  }

  function navigatePublicPage(page) {
    const path = publicPagePaths[page] || publicPagePaths.landing;
    if (`${window.location.pathname}${window.location.search}` !== path) {
      window.history.pushState({}, "", path);
    }
    setPublicPage(page);
    setAuthMode(getAuthModeFromPublicPage(page));
    setAuthMessage("");
    setAuthPasswordVisible(false);
    setConsentModalStep("");
    setConsentPreviewMode(false);
    if (page !== "register") {
      setRegisterConsentAccepted(false);
    }
  }

  function authHeaders(extra = {}) {
    return {
      ...extra,
      ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
    };
  }

  async function loadCurrentUser(token = sessionToken) {
    try {
      const payload = await requestJson(`${apiBaseUrl}/api/auth/me`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }, "Failed to load account");
      setUser(payload.user);
      return payload.user;
    } catch {
      window.localStorage.removeItem(authStorageKey);
      setSessionToken("");
      setUser(null);
      return null;
    }
  }

  async function loadDashboardPlans() {
    try {
      const payload = await requestJson(`${apiBaseUrl}/api/plans`, { headers: authHeaders() }, "Failed to load events");
      setDashboardPlans(sortPlans(Array.isArray(payload.items) ? payload.items : []));
    } catch (error) {
      alert(error.message);
    }
  }

  async function loadPlan(planId) {
    try {
      const plan = await requestJson(`${apiBaseUrl}/api/plans/${planId}`, { headers: authHeaders() }, "Failed to load event");
      setCurrentPlan((current) => (current?.id === plan.id ? plan : current));
      upsertPlan(plan);
    } catch (error) {
      console.error(error);
    }
  }

  function upsertPlan(plan) {
    setDashboardPlans((current) => {
      const next = [...current];
      const index = next.findIndex((item) => item.id === plan.id);
      if (index >= 0) next[index] = plan;
      else next.push(plan);
      return sortPlans(next);
    });
  }

  function handleFieldChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  function handleAuthFieldChange(event) {
    const { name, value } = event.target;
    setAuthForm((current) => ({ ...current, [name]: value }));
    setAuthMessage("");
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthBusy(true);
    setAuthMessage("");

    try {
      if (authMode === "forgot") {
        await requestJson(
          `${apiBaseUrl}/api/auth/forgot-password`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: authForm.email })
          },
          "Failed to start password reset"
        );
        setAuthMessage("If that email exists, a reset message has been sent.");
        return;
      }

      if (authMode === "reset") {
        await requestJson(
          `${apiBaseUrl}/api/auth/reset-password`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: authForm.token, password: authForm.password })
          },
          "Failed to reset password"
        );
        setAuthForm(emptyAuthForm);
        setAuthMessage("Password updated. Sign in with your new password.");
        navigatePublicPage("login");
        return;
      }

      if (authMode === "register" && !registerConsentAccepted) {
        setAuthMessage("You must agree to the Privacy Policy and Terms of Use before creating an account.");
        return;
      }

      const payload = await requestJson(
        `${apiBaseUrl}/api/auth/${authMode === "login" ? "login" : "register"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            authMode === "login"
              ? { identifier: authForm.identifier, password: authForm.password }
              : { email: authForm.email, fullName: authForm.fullName, password: authForm.password }
          )
        },
        authMode === "login" ? "Failed to sign in" : "Failed to create account"
      );

      finalizeAuthSession(payload.token, payload.user);
    } catch (error) {
      alert(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleOAuthSignIn(provider) {
    setAuthBusy(true);
    setAuthMessage("");

    try {
      const payload = await requestJson(
        `${apiBaseUrl}/api/auth/oauth/${provider}`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
        "Failed to start provider sign-in"
      );

      if (payload.url) {
        window.location.href = payload.url;
        return;
      }

      setAuthMessage("Provider sign-in URL was not returned.");
    } catch (error) {
      setAuthMessage(error.message);
    } finally {
      setAuthBusy(false);
    }
  }

  function handleOpenContactModal() {
    setContactModalOpen(true);
    setContactMessage("");
  }

  function handleCloseContactModal() {
    if (contactBusy) return;
    setContactModalOpen(false);
    setContactForm(emptyContactForm);
    setContactMessage("");
  }

  function handleContactFieldChange(event) {
    const { name, value } = event.target;
    setContactForm((current) => ({ ...current, [name]: value }));
    setContactMessage("");
  }

  async function handleContactSubmit(event) {
    event.preventDefault();
    setContactBusy(true);
    setContactMessage("");

    try {
      await requestJson(
        `${apiBaseUrl}/api/public/contact`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(contactForm)
        },
        "Failed to send message"
      );
      setContactMessage("Message sent.");
      setContactForm(emptyContactForm);
    } catch (error) {
      setContactMessage(error.message);
    } finally {
      setContactBusy(false);
    }
  }

  function handleRegisterConsentToggle() {
    if (registerConsentAccepted) {
      setRegisterConsentAccepted(false);
      setConsentModalStep("");
      setConsentPreviewMode(false);
      return;
    }

    setConsentPreviewMode(false);
    setConsentModalStep("privacy");
  }

  function handleConsentAgree() {
    if (consentPreviewMode) {
      setConsentModalStep("");
      setConsentPreviewMode(false);
      return;
    }

    if (consentModalStep === "privacy") {
      setConsentModalStep("terms");
      return;
    }

    if (consentModalStep === "terms") {
      setRegisterConsentAccepted(true);
      setConsentModalStep("");
      setConsentPreviewMode(false);
      setAuthMessage("");
    }
  }

  function handleConsentDisagree() {
    setRegisterConsentAccepted(false);
    setConsentModalStep("");
    setConsentPreviewMode(false);
  }

  function handleOpenConsentDocument(documentKey) {
    setConsentPreviewMode(true);
    setConsentModalStep(documentKey);
  }

  async function handleLogout() {
    try {
      if (sessionToken) {
        await requestJson(`${apiBaseUrl}/api/auth/logout`, { method: "POST", headers: authHeaders() }, "Failed to sign out");
      }
    } catch (error) {
      console.error(error);
    } finally {
      resetSessionState();
    }
  }

  function handleProfileFieldChange(event) {
    const { name, value } = event.target;
    setProfileForm((current) => ({ ...current, [name]: value }));
    setProfileMessage("");
  }

  function handlePasswordSettingsChange(event) {
    const { name, value } = event.target;
    setPasswordSettingsForm((current) => ({ ...current, [name]: value }));
    setPasswordSettingsMessage("");
  }

  function handleDeleteSettingsChange(event) {
    const { name, value } = event.target;
    setDeleteSettingsForm((current) => ({ ...current, [name]: value }));
    setDeleteSettingsMessage("");
  }

  async function handleProfileSave(event) {
    event.preventDefault();
    setProfileSaving(true);
    setProfileMessage("");

    try {
      const payload = await requestJson(
        `${apiBaseUrl}/api/account/profile`,
        {
          method: "PUT",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(profileForm)
        },
        "Failed to update profile"
      );
      setUser(payload.user);
      setProfileMessage("Profile updated.");
    } catch (error) {
      setProfileMessage(error.message);
    } finally {
      setProfileSaving(false);
    }
  }

  async function handlePasswordCodeRequest(event) {
    event.preventDefault();
    setPasswordSettingsBusy(true);
    setPasswordSettingsMessage("");

    try {
      await requestJson(
        `${apiBaseUrl}/api/account/change-password/request`,
        {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ newPassword: passwordSettingsForm.newPassword })
        },
        "Failed to send password verification code"
      );
      setPasswordSettingsMessage(`Verification code sent to ${user.email}.`);
    } catch (error) {
      setPasswordSettingsMessage(error.message);
    } finally {
      setPasswordSettingsBusy(false);
    }
  }

  async function handlePasswordChangeConfirm() {
    setPasswordSettingsBusy(true);
    setPasswordSettingsMessage("");

    try {
      await requestJson(
        `${apiBaseUrl}/api/account/change-password/confirm`,
        {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ code: passwordSettingsForm.code })
        },
        "Failed to change password"
      );
      alert("Password changed. Please sign in again.");
      await handleLogout();
    } catch (error) {
      setPasswordSettingsMessage(error.message);
      setPasswordSettingsBusy(false);
    }
  }

  async function handleDeleteCodeRequest(event) {
    event.preventDefault();
    setDeleteSettingsBusy(true);
    setDeleteSettingsMessage("");

    try {
      await requestJson(
        `${apiBaseUrl}/api/account/delete/request`,
        {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" })
        },
        "Failed to send delete verification code"
      );
      setDeleteSettingsMessage(`Verification code sent to ${user.email}.`);
    } catch (error) {
      setDeleteSettingsMessage(error.message);
    } finally {
      setDeleteSettingsBusy(false);
    }
  }

  async function handleDeleteAccountConfirm() {
    const confirmed = window.confirm("Delete your account and all related data permanently?");
    if (!confirmed) {
      return;
    }

    setDeleteSettingsBusy(true);
    setDeleteSettingsMessage("");

    try {
      await requestJson(
        `${apiBaseUrl}/api/account/delete/confirm`,
        {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ code: deleteSettingsForm.code })
        },
        "Failed to delete account"
      );
      resetSessionState();
    } catch (error) {
      setDeleteSettingsMessage(error.message);
      setDeleteSettingsBusy(false);
    }
  }

  async function loadCalendarAccounts() {
    setCalendarLoading(true);
    try {
      const payload = await requestJson(`${apiBaseUrl}/api/calendar/accounts`, { headers: authHeaders() }, "Failed to load calendars");
      setCalendarAccounts(Array.isArray(payload.items) ? payload.items : []);
    } catch (error) {
      setCalendarMessage(error.message);
    } finally {
      setCalendarLoading(false);
    }
  }

  async function handleCalendarConnect(provider) {
    setCalendarMessage("");
    try {
      const payload = await requestJson(
        `${apiBaseUrl}/api/calendar/connect/${provider}`,
        { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }) },
        "Failed to start calendar connection"
      );
      if (payload.url) {
        window.location.href = payload.url;
      }
    } catch (error) {
      setCalendarMessage(error.message);
    }
  }

  async function handleCalendarDisconnect(accountId) {
    setCalendarMessage("");
    try {
      await requestJson(
        `${apiBaseUrl}/api/calendar/accounts/${accountId}`,
        { method: "DELETE", headers: authHeaders() },
        "Failed to disconnect calendar"
      );
      await loadCalendarAccounts();
      setCalendarTimeline(null);
    } catch (error) {
      setCalendarMessage(error.message);
    }
  }

  function handleCalendarRangeChange(event) {
    const { name, value } = event.target;
    setCalendarRange((current) => ({ ...current, [name]: value }));
  }

  async function handleRefreshTimeline() {
    setCalendarTimelineLoading(true);
    setCalendarMessage("");
    try {
      const start = toIsoFromLocalInput(calendarRange.start);
      const end = toIsoFromLocalInput(calendarRange.end);
      const timeline = await requestJson(
        `${apiBaseUrl}/api/calendar/timeline?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { headers: authHeaders() },
        "Failed to load calendar timeline"
      );
      setCalendarTimeline(timeline);
    } catch (error) {
      setCalendarMessage(error.message);
    } finally {
      setCalendarTimelineLoading(false);
    }
  }

  function handleCalendarEventChange(event) {
    const { name, value } = event.target;
    setCalendarEventForm((current) => ({ ...current, [name]: value }));
    setCalendarEventMessage("");
  }

  function handleToggleCalendarAccount(accountId, selected) {
    setCalendarEventForm((current) => {
      const nextIds = new Set(current.accountIds);
      if (selected) nextIds.add(accountId);
      else nextIds.delete(accountId);
      return { ...current, accountIds: Array.from(nextIds) };
    });
  }

  async function handleCreateCalendarEvent(event) {
    event.preventDefault();
    setCalendarEventBusy(true);
    setCalendarEventMessage("");
    try {
      const payload = {
        ...calendarEventForm,
        start: toIsoFromLocalInput(calendarEventForm.start),
        end: toIsoFromLocalInput(calendarEventForm.end),
        planId: currentPlan?.id || ""
      };
      const result = await requestJson(
        `${apiBaseUrl}/api/calendar/events`,
        { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(payload) },
        "Failed to create calendar event"
      );
      const first = result.results?.find((item) => item.calendarEventId);
      if (first?.calendarEventId) {
        setLastCalendarEventId(first.calendarEventId);
      }
      setCalendarEventMessage("Calendar hold created.");
      await handleRefreshTimeline();
    } catch (error) {
      setCalendarEventMessage(error.message);
    } finally {
      setCalendarEventBusy(false);
    }
  }

  async function handleUpdateCalendarEvent() {
    if (!lastCalendarEventId) return;
    setCalendarEventBusy(true);
    setCalendarEventMessage("");
    try {
      const payload = {
        ...calendarEventForm,
        start: toIsoFromLocalInput(calendarEventForm.start),
        end: toIsoFromLocalInput(calendarEventForm.end)
      };
      await requestJson(
        `${apiBaseUrl}/api/calendar/events/${lastCalendarEventId}`,
        { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(payload) },
        "Failed to update calendar event"
      );
      setCalendarEventMessage("Calendar hold updated.");
      await handleRefreshTimeline();
    } catch (error) {
      setCalendarEventMessage(error.message);
    } finally {
      setCalendarEventBusy(false);
    }
  }

  function goToAccountPage(page) {
    setCurrentPage(page);
    setAccountMenuOpen(false);
  }

  async function handleContinue() {
    setSavingPlan(true);
    const requestId = saveRequestIdRef.current + 1;
    saveRequestIdRef.current = requestId;
    try {
      const plan = await requestJson(`${apiBaseUrl}/api/plans${editingPlanId ? `/${editingPlanId}` : ""}`, { method: editingPlanId ? "PUT" : "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(formData) }, "The API could not generate a plan.");
      if (saveRequestIdRef.current !== requestId) {
        return;
      }
      setCurrentPlan(plan);
      setEditingPlanId(plan.id);
      setFormData(eventFormFromPlan(plan));
      setIntake(
        buildEditorIntakeFromPlan(
          plan,
          editingPlanId
            ? "Event details updated. Stored data and recommendations were regenerated from the latest inputs."
            : "Plan created from the latest event details."
        )
      );
      setWorkspaceMessage("");
      upsertPlan(plan);
      setActiveStep(1);
    } catch (error) {
      if (saveRequestIdRef.current !== requestId) {
        return;
      }
      alert(error.message);
    } finally {
      if (saveRequestIdRef.current === requestId) {
        setSavingPlan(false);
      }
    }
  }

  async function handleSavePlan(event) {
    event?.preventDefault();
    setActiveStep(0);
    setAnalyzing(true);
    const requestId = analyzeRequestIdRef.current + 1;
    analyzeRequestIdRef.current = requestId;

    try {
      const nextIntake = await requestJson(
        `${apiBaseUrl}/api/intake`,
        { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(formData) },
        "The API could not analyze the event."
      );
      if (analyzeRequestIdRef.current !== requestId) {
        return;
      }

      setIntake(nextIntake);
      setWorkspaceMessage("");

      if (nextIntake.readiness === "ready-for-research") {
        await handleContinue();
      }
    } catch (error) {
      if (analyzeRequestIdRef.current !== requestId) {
        return;
      }
      alert(error.message);
    } finally {
      if (analyzeRequestIdRef.current === requestId) {
        setAnalyzing(false);
      }
    }
  }

  function handleResetEdit() {
    setEditingPlanId(null);
    setCurrentPlan(null);
    setIntake(null);
    setFormData(emptyForm);
    setWorkspaceMessage("");
    setActiveStep(0);
    setCurrentPage("home");
  }

  function handleEditPlan(plan) {
    setEditingPlanId(plan.id);
    setCurrentPlan(plan);
    setIntake(buildEditorIntakeFromPlan(plan, "Loaded existing plan into the editor."));
    setFormData(eventFormFromPlan(plan));
    setWorkspaceMessage("");
    setActiveStep(1);
    setCurrentPage("workspace");
  }

  async function handleTogglePause(plan) {
    try {
      const updatedPlan = await requestJson(`${apiBaseUrl}/api/plans/${plan.id}/pause`, { method: "PATCH", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ paused: !plan.isPaused }) }, "Failed to update pause state");
      upsertPlan(updatedPlan);
      if (currentPlan?.id === updatedPlan.id) setCurrentPlan(updatedPlan);
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleDeletePlan(plan) {
    try {
      await requestJson(`${apiBaseUrl}/api/plans/${plan.id}`, { method: "DELETE", headers: authHeaders() }, "Failed to delete event");
      setDashboardPlans((current) => current.filter((item) => item.id !== plan.id));
      if (currentPlan?.id === plan.id) handleResetEdit();
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleSendInquiries() {
    if (!currentPlan) return;
    setSendingInquiries(true);
    try {
      const updatedPlan = await requestJson(`${apiBaseUrl}/api/plans/${currentPlan.id}/send-inquiries`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }) }, "Failed to send inquiry emails");
      setCurrentPlan(updatedPlan);
      upsertPlan(updatedPlan);
      setWorkspaceMessage("");
      await loadCurrentUser();
    } catch (error) {
      setWorkspaceMessage(error.message);
    } finally {
      setSendingInquiries(false);
    }
  }

  async function handleToggleVendorCategory(categoryKey, selected) {
    if (!currentPlan) return;

    const nextCategories = (currentPlan.vendorCategories || []).map((category) =>
      category.key === categoryKey ? { ...category, selected } : category
    );
    const selectedVendorCategories = nextCategories.filter((category) => category.selected).map((category) => category.key);
    const previousPlan = currentPlan;

    setCurrentPlan((current) => (
      current
        ? { ...current, vendorCategories: nextCategories }
        : current
    ));
    upsertPlan({
      ...currentPlan,
      vendorCategories: nextCategories
    });

    setCategorySaving(true);
    try {
      const updatedPlan = await requestJson(
        `${apiBaseUrl}/api/plans/${currentPlan.id}/vendor-categories`,
        {
          method: "PATCH",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            selectedVendorCategories
          })
        },
        "Failed to update vendor categories"
      );
      setCurrentPlan(updatedPlan);
      upsertPlan(updatedPlan);
    } catch (error) {
      setCurrentPlan(previousPlan);
      upsertPlan(previousPlan);
      alert(error.message);
    } finally {
      setCategorySaving(false);
    }
  }

  async function handleStartOutreach() {
    setActiveStep(2);
    await handleSendInquiries();
  }

  function handleShowVendors() {
    setActiveStep(2);
  }

  async function handleHomeAnalyze(event) {
    event.preventDefault();
    const nextIntake = buildLocalIntake(formData);
    setCurrentPlan(null);
    setEditingPlanId(null);
    setIntake(nextIntake);
    setWorkspaceMessage("");
    setActiveStep(0);
    setCurrentPage("workspace");

    if (nextIntake.readiness === "ready-for-research") {
      await handleSavePlan();
    }
  }

  async function handleFinalizeVendor(vendorId) {
    if (!currentPlan) return;
    try {
      const updatedPlan = await requestJson(`${apiBaseUrl}/api/plans/${currentPlan.id}/finalize`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ vendorId }) }, "Failed to finalize vendor");
      setCurrentPlan(updatedPlan);
      upsertPlan(updatedPlan);
      setWorkspaceMessage("");
      await loadCurrentUser();
    } catch (error) {
      setWorkspaceMessage(error.message);
    }
  }

  const steps = [
    { id: "intake", label: "Idea intake" },
    { id: "direction", label: "Direction" },
    { id: "matches", label: "Matches" },
    { id: "comms", label: "Comms" }
  ];

  const canAccessStep = (index) => {
    if (index === 0) return true;
    if (index === 1) return Boolean(currentPlan);
    return Boolean(currentPlan);
  };

  if (authLoading) {
    return (
      <main className="shell">
        <section className="panel auth-panel">
          <h2>Loading account</h2>
          <p className="fine-print">Checking your saved session.</p>
        </section>
      </main>
    );
  }

  if (!user) {
    const isLegalPage = publicPage === "privacy" || publicPage === "terms";
    const isPricingPage = publicPage === "pricing";
    const showHomeAction = publicPage !== "landing";
    const showLoginAction = publicPage !== "login";
    const showRegisterAction = publicPage !== "register";
    const showPricingAction = publicPage !== "pricing";
    const publicHeading = publicPage === "landing"
      ? "Share the vision. Let us shape the event."
      : isPricingPage
        ? "Plans that fit you"
      : isLegalPage
        ? "Legal information"
        : "Account access";

    return (
      <main className="shell public-shell">
        <section className="topbar public-topbar">
          <div>
            <p className="eyebrow">AI Event Planner</p>
            <h1>{publicHeading}</h1>
          </div>
          <div className="public-auth-actions">
            {showHomeAction ? (
              <button type="button" className="secondary" onClick={() => navigatePublicPage("landing")}>Home</button>
            ) : null}
            {showPricingAction ? (
              <button type="button" className="secondary" onClick={() => navigatePublicPage("pricing")}>Pricing</button>
            ) : null}
            {showLoginAction ? (
              <button type="button" className="secondary" onClick={() => navigatePublicPage("login")}>Login</button>
            ) : null}
            {showRegisterAction ? (
              <button type="button" onClick={() => navigatePublicPage("register")}>Register</button>
            ) : null}
          </div>
        </section>
        {publicPage === "landing" ? (
          <LandingPage
            onLogin={() => navigatePublicPage("login")}
            onRegister={() => navigatePublicPage("register")}
            onNavigate={navigatePublicPage}
          />
        ) : publicPage === "privacy" ? (
          <LegalPage
            title="Privacy Policy"
            summary="Last updated April 1, 2026. This page explains what information AI Event Planner collects, how it is used, and how connected services such as Google Calendar fit into that use."
            sections={privacySections}
            onNavigate={navigatePublicPage}
          />
        ) : publicPage === "terms" ? (
          <LegalPage
            title="Terms of Use"
            summary="Last updated April 1, 2026. These terms govern access to and use of AI Event Planner, including connected integrations and generated planning workflows."
            sections={termsSections}
            onNavigate={navigatePublicPage}
          />
        ) : publicPage === "pricing" ? (
          <PricingPage onOpenContactModal={handleOpenContactModal} />
        ) : (
          <AuthSection
            mode={authMode}
            formData={authForm}
            busy={authBusy}
            message={authMessage}
            passwordVisible={authPasswordVisible}
            registerConsentAccepted={registerConsentAccepted}
            onChange={handleAuthFieldChange}
            onSubmit={handleAuthSubmit}
            onOAuth={handleOAuthSignIn}
            onOpenConsentDocument={handleOpenConsentDocument}
            onTogglePasswordVisibility={() => setAuthPasswordVisible((visible) => !visible)}
            onRegisterConsentToggle={handleRegisterConsentToggle}
            onSwitch={navigatePublicPage}
            onNavigate={navigatePublicPage}
          />
        )}
        {["landing", "login", "register", "pricing"].includes(publicPage) ? (
          <section className="public-footer-panel">
            <FooterLinks onNavigate={navigatePublicPage} onContact={handleOpenContactModal} />
          </section>
        ) : null}
        {consentModalStep ? (
          <ConsentModal
            documentKey={consentModalStep}
            onAgree={handleConsentAgree}
            onDisagree={handleConsentDisagree}
          />
        ) : null}
        {contactModalOpen ? (
          <ContactModal
            formData={contactForm}
            busy={contactBusy}
            message={contactMessage}
            onChange={handleContactFieldChange}
            onClose={handleCloseContactModal}
            onSubmit={handleContactSubmit}
          />
        ) : null}
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="topbar">
        {(currentPage === "profile" || currentPage === "settings" || currentPage === "admin") ? (
          <button type="button" className="secondary" onClick={() => setCurrentPage("home")}>
            Return to dashboard
          </button>
        ) : null}
        <div>
          <p className="eyebrow">AI Event Planner</p>
          <h1>
            {
              {
                home: "Operations dashboard",
                workspace: "Event workspace",
                profile: "Profile",
                settings: "Settings",
                admin: "Admin"
              }[currentPage] || "AI Event Planner"
            }
          </h1>
        </div>
        <div className="topbar-actions">
          {currentPage === "workspace" ? (
            <button type="button" className="secondary" onClick={() => setCurrentPage("home")}>
              Back to dashboard
            </button>
          ) : null}
          <div className="topbar-badge">Live event workflow</div>
          <div className="account-menu-wrap" ref={accountMenuRef}>
            <button
              type="button"
              className="account-avatar-button"
              onClick={() => setAccountMenuOpen((open) => !open)}
              aria-label="Open account menu"
            >
              <span className="account-avatar">{getUserInitials(user)}</span>
            </button>
            {accountMenuOpen ? (
              <div className="account-menu">
                <div className="account-menu-header">
                  <strong>{user.fullName || user.username}</strong>
                  <span>{user.email}</span>
                </div>
                <button type="button" className="account-menu-item" onClick={() => goToAccountPage("profile")}>
                  Profile
                </button>
                <button type="button" className="account-menu-item" onClick={() => goToAccountPage("settings")}>
                  Settings
                </button>
                {user.accountType === "admin" ? (
                  <button type="button" className="account-menu-item" onClick={() => goToAccountPage("admin")}>
                    Admin
                  </button>
                ) : null}
                <button type="button" className="account-menu-item" onClick={() => { setAccountMenuOpen(false); handleLogout(); }}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {currentPage === "home" ? (
        <div className="home-stage">
          <div className="home-dashboard">
            <DashboardSection plans={dashboardPlans} onEdit={handleEditPlan} onPause={handleTogglePause} onDelete={handleDeletePlan} />
          </div>
          <div className="home-composer-wrap">
            <SharedComposer
              mode="home"
              formData={formData}
              onChange={handleFieldChange}
              onSubmit={handleHomeAnalyze}
              analyzing={analyzing}
            />
          </div>
        </div>
      ) : currentPage === "workspace" ? (
        <section className="workspace-stage">
          <section className="carousel">
            <SharedComposer
              mode="workspace"
              formData={formData}
              onChange={handleFieldChange}
              onSubmit={handleSavePlan}
              onResetEdit={handleResetEdit}
              onAdvance={handleContinue}
              editingPlanId={editingPlanId}
              currentPlan={currentPlan}
              analyzing={analyzing}
              savingPlan={savingPlan}
              intake={intake}
            />
            <div className="carousel-tabs">
              {steps.map((step, index) => (
                <button
                  key={step.id}
                  type="button"
                  className={`tab-button ${activeStep === index ? "active" : ""}`}
                  onClick={() => { if (canAccessStep(index)) setActiveStep(index); }}
                  disabled={!canAccessStep(index)}
                >
                  <span className="tab-index">{index + 1}</span>
                  {step.label}
                </button>
              ))}
            </div>
            <div className="carousel-track" style={{ transform: `translateX(-${activeStep * 100}%)` }}>
              <div className="carousel-slide">
                <IntakeSection intake={intake} analyzing={analyzing} />
              </div>
              <div className="carousel-slide">
                {currentPlan ? (
                  <DirectionSection
                    plan={currentPlan}
                    intake={intake}
                    onShowVendors={handleShowVendors}
                    onToggleVendorCategory={handleToggleVendorCategory}
                    categorySaving={categorySaving}
                  />
                ) : (
                  <section className="panel">
                    <h2>Create an event plan to continue</h2>
                    <p>Complete the intake details and continue to generate event direction.</p>
                  </section>
                )}
              </div>
              <div className="carousel-slide">
                {currentPlan ? (
                  <MatchesSection
                    plan={currentPlan}
                    user={user}
                    message={workspaceMessage}
                    onFinalizeVendor={handleFinalizeVendor}
                    onSendInquiries={handleStartOutreach}
                    sendingInquiries={sendingInquiries}
                  />
                ) : (
                  <section className="panel">
                    <h2>No recommendations yet</h2>
                    <p>Generate the event plan first to see recommended matches.</p>
                  </section>
                )}
              </div>
              <div className="carousel-slide">
                {currentPlan ? (
                  <CommunicationSection plan={currentPlan} />
                ) : (
                  <section className="panel">
                    <h2>No communications yet</h2>
                    <p>Once outreach begins, the communication log will appear here.</p>
                  </section>
                )}
              </div>
            </div>
            <div className="carousel-nav">
              <button type="button" className="secondary" onClick={() => setActiveStep((step) => Math.max(0, step - 1))} disabled={activeStep === 0}>
                Previous
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setActiveStep((step) => Math.min(steps.length - 1, step + 1))}
                disabled={!canAccessStep(activeStep + 1)}
              >
                Next
              </button>
            </div>
          </section>
        </section>
      ) : (
        <section className="account-stage">
          <AccountPanel
            view={currentPage}
            user={user}
            profileForm={profileForm}
            profileSaving={profileSaving}
            profileMessage={profileMessage}
            onProfileChange={handleProfileFieldChange}
            onProfileSave={handleProfileSave}
            passwordForm={passwordSettingsForm}
            passwordBusy={passwordSettingsBusy}
            passwordMessage={passwordSettingsMessage}
            onPasswordChange={handlePasswordSettingsChange}
            onPasswordRequest={handlePasswordCodeRequest}
            onPasswordConfirm={handlePasswordChangeConfirm}
            deleteForm={deleteSettingsForm}
            deleteBusy={deleteSettingsBusy}
            deleteMessage={deleteSettingsMessage}
            onDeleteChange={handleDeleteSettingsChange}
            onDeleteRequest={handleDeleteCodeRequest}
            onDeleteConfirm={handleDeleteAccountConfirm}
            calendarState={{
              accounts: calendarAccounts,
              loadingAccounts: calendarLoading,
              message: calendarMessage,
              onConnect: handleCalendarConnect,
              onDisconnect: handleCalendarDisconnect,
              timeline: calendarTimeline,
              timelineLoading: calendarTimelineLoading,
              range: calendarRange,
              onRangeChange: handleCalendarRangeChange,
              onRefreshTimeline: handleRefreshTimeline,
              eventForm: calendarEventForm,
              onEventChange: handleCalendarEventChange,
              onToggleAccount: handleToggleCalendarAccount,
              onCreateEvent: handleCreateCalendarEvent,
              eventBusy: calendarEventBusy,
              eventMessage: calendarEventMessage,
              lastCalendarEventId,
              onUpdateEvent: handleUpdateCalendarEvent
            }}
          />
        </section>
      )}
    </main>
  );
}

function LandingPage({ onLogin, onRegister, onNavigate }) {
  return (
    <section className="landing-page">
      <div className="landing-hero panel">
        <div className="landing-hero-copy">
          <p className="section-kicker">Automated event operations</p>
          <h2>
            Brief once.<br />
            Explore ideas.<br />
            Source vendors.<br />
            Reach out.<br />
            All in<br />
            one space.
          </h2>
          <p className="landing-lead">
            AI Event Planner turns a rough event idea into a working plan with vendor categories, recommended matches,
            live vendor outreach, price negotiation, and an operations dashboard your team can actually use.
          </p>
          <div className="landing-cta-row">
            <button type="button" onClick={onRegister}>Create an account</button>
            <button type="button" className="secondary" onClick={onLogin}>Sign in</button>
          </div>
          <div className="landing-proof-strip">
            <span>Ideas shaped from one brief</span>
            <span>Vendor sourcing by category</span>
            <span>Live outreach sent for you</span>
            <span>Price negotiation in motion</span>
            <span>Replies tracked in one space</span>
            <span>Calendar holds and event flow</span>
          </div>
        </div>
        <div className="landing-hero-card">
          <div className="landing-offer-callout">
            <strong className="landing-offer-title">
              <span>Plan Your First Event</span>
              <span>With Every Feature</span>
              <span>Unlocked!</span>
            </strong>
            <p className="fine-print">
              Creating an account and planning your first event is fully free for all features, including automatic
              communications and price negotiations!
            </p>
            <button type="button" className="text-link landing-pricing-link" onClick={() => onNavigate("pricing")}>
              See Pricing
            </button>
          </div>
          <div className="landing-hero-metrics">
            <div className="landing-mini-card">
              <span className="metric-label">Event status</span>
              <strong>Plan ready in minutes</strong>
              <p>Move from intake to shortlist, outreach, and final vendor selection without juggling spreadsheets.</p>
            </div>
            <div className="landing-mini-grid">
              <div className="metric-card">
                <span className="metric-label">Vendors accessible</span>
                <strong>1000s</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Replies tracked</span>
                <strong>7</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">Planning steps</span>
                <strong>4</strong>
              </div>
              <div className="metric-card">
                <span className="metric-label">One workspace</span>
                <strong>100%</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="landing-grid">
        <article className="panel landing-feature-card">
          <p className="section-kicker">For busy planning</p>
          <h3>Start with the vision</h3>
          <p className="fine-print">Share the event idea once and the app helps shape the brief, collect missing details, and turn it into a workable direction.</p>
        </article>
        <article className="panel landing-feature-card">
          <p className="section-kicker">For vendor sourcing</p>
          <h3>Source the right vendors</h3>
          <p className="fine-print">Vendor categories and matches stay tied to the event plan, so you can review options, compare fit, and move quickly.</p>
        </article>
        <article className="panel landing-feature-card">
          <p className="section-kicker">For execution</p>
          <h3>Keep execution moving</h3>
          <p className="fine-print">Send outreach, manage replies, negotiate pricing, and keep the event moving forward without bouncing between tools.</p>
        </article>
      </div>

      <section className="panel why-us-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Why choose us</p>
            <h3>More than ideas. More than a vendor list.</h3>
          </div>
        </div>
        <div className="why-us-grid">
          <article className="landing-feature-card why-us-card">
            <h3>1. One flow, not five tools</h3>
            <p className="fine-print">Most event tools stop at inspiration or planning notes. AI Event Planner connects ideas, vendor sourcing, outreach, negotiation, and execution in one place.</p>
          </article>
          <article className="landing-feature-card why-us-card">
            <h3>2. We do the outreach</h3>
            <p className="fine-print">Instead of leaving you with a shortlist to manage manually, the app is built to send outreach, track replies, and keep vendor conversations moving.</p>
          </article>
          <article className="landing-feature-card why-us-card">
            <h3>3. Built for momentum</h3>
            <p className="fine-print">The goal is not just to organize information. It is to help you move from vision to booked vendors and a live event plan without losing speed.</p>
          </article>
        </div>
      </section>
    </section>
  );
}

function AuthSection({ mode, formData, busy, message, passwordVisible, registerConsentAccepted, onChange, onSubmit, onOAuth, onOpenConsentDocument, onTogglePasswordVisibility, onRegisterConsentToggle, onSwitch, onNavigate }) {
  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";
  const showOAuth = isLogin || isRegister;

  return (
    <section className="auth-shell">
      <div className="panel auth-panel">
        <p className="section-kicker">{isLogin ? "Log in" : isRegister ? "Register" : "Account"}</p>
        <h2>{isLogin ? "Welcome Back!" : isRegister ? "Create account" : isForgot ? "Reset password" : "Choose a new password"}</h2>
        <p className="fine-print">
          {isLogin
            ? "Sign in with your provider or email to access your event plans."
            : isRegister
              ? "Register using your provider or email. We will generate a unique username for you."
              : isForgot
                ? "Enter your email address and we will send a reset message."
                : "Paste the reset token from your email and choose a strong new password."}
        </p>
        {message ? <p className="fine-print">{message}</p> : null}
        {showOAuth ? (
          <>
            <div className="auth-divider"><span>use provider</span></div>
            <div className="oauth-actions">
              <button type="button" className="secondary oauth-button oauth-provider-button" disabled>
                <span className="oauth-provider-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img" focusable="false">
                    <path fill="#EA4335" d="M12 10.2v3.9h5.4c-.2 1.3-1.5 3.9-5.4 3.9-3.2 0-5.9-2.7-5.9-6s2.7-6 5.9-6c1.8 0 3.1.8 3.8 1.4l2.6-2.5C16.7 3.3 14.6 2.4 12 2.4 6.9 2.4 2.8 6.5 2.8 11.6s4.1 9.2 9.2 9.2c5.3 0 8.8-3.7 8.8-8.9 0-.6-.1-1.1-.1-1.7H12Z" />
                    <path fill="#34A853" d="M2.8 11.6c0 1.6.4 3.2 1.3 4.5l3.3-2.5c-.4-.6-.6-1.3-.6-2s.2-1.4.6-2L4.1 7.1c-.9 1.3-1.3 2.8-1.3 4.5Z" />
                    <path fill="#FBBC05" d="M12 20.8c2.5 0 4.7-.8 6.3-2.3l-3.1-2.4c-.8.5-1.8.8-3.2.8-2.5 0-4.6-1.7-5.3-4l-3.4 2.6c1.6 3.1 4.8 5.3 8.7 5.3Z" />
                    <path fill="#4285F4" d="M18.3 18.5c1.8-1.6 2.5-4 2.5-6.6 0-.6-.1-1.1-.1-1.7H12v3.9h5.4c-.2 1-.8 2.5-2.2 3.4l3.1 2.4Z" />
                  </svg>
                </span>
                <span>Google</span>
              </button>
              <button type="button" className="secondary oauth-button oauth-provider-button" disabled>
                <span className="oauth-provider-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img" focusable="false">
                    <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
                    <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
                    <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
                    <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
                  </svg>
                </span>
                <span>Microsoft</span>
              </button>
              <button type="button" className="secondary oauth-button oauth-provider-button" disabled>
                <span className="oauth-provider-mark" aria-hidden="true">
                  <svg viewBox="0 0 24 24" role="img" focusable="false">
                    <path
                      fill="currentColor"
                      d="M16.7 12.7c0-2.3 1.9-3.4 2-3.4-1.1-1.6-2.8-1.8-3.4-1.8-1.5-.2-2.8.8-3.6.8-.8 0-1.9-.8-3.2-.8-1.7 0-3.2 1-4 2.4-1.7 2.9-.4 7.3 1.2 9.6.8 1.1 1.7 2.4 2.9 2.3 1.2 0 1.6-.7 3-.7s1.8.7 3 .7c1.3 0 2.1-1.1 2.9-2.3.9-1.3 1.3-2.6 1.3-2.7-.1 0-2.3-.9-2.3-4.1Zm-2.3-6.8c.7-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.9-1 3 .9.1 2-.5 2.8-1.4Z"
                    />
                  </svg>
                </span>
                <span>Apple</span>
              </button>
            </div>
          </>
        ) : null}
        {showOAuth ? <div className="auth-divider"><span>or use email</span></div> : null}
        <form className="planner-form" onSubmit={onSubmit}>
          {isLogin ? (
            <label className="field">
              <span>Email or username</span>
              <input name="identifier" value={formData.identifier} onChange={onChange} placeholder="you@example.com" autoComplete="username" />
            </label>
          ) : null}
          {isRegister ? (
            <>
              <label className="field">
                <span>Full name</span>
                <input name="fullName" value={formData.fullName} onChange={onChange} placeholder="John Hand" autoComplete="name" />
              </label>
              <label className="field">
                <span>Email</span>
                <input name="email" value={formData.email} onChange={onChange} placeholder="you@example.com" autoComplete="email" />
              </label>
            </>
          ) : null}
          {isForgot ? (
            <label className="field">
              <span>Email</span>
              <input name="email" value={formData.email} onChange={onChange} placeholder="you@example.com" autoComplete="email" />
            </label>
          ) : null}
          {isReset ? (
            <label className="field">
              <span>Reset token</span>
              <input name="token" value={formData.token} onChange={onChange} placeholder="Paste the token from the email" autoComplete="one-time-code" />
            </label>
          ) : null}
          {!isForgot ? (
            <>
              <PasswordField
                name="password"
                value={formData.password}
                onChange={onChange}
                placeholder="8+ chars, upper, lower, number, symbol"
                autoComplete={isLogin ? "current-password" : "new-password"}
                visible={passwordVisible}
                onToggle={onTogglePasswordVisibility}
              />
              {isLogin ? (
                <button type="button" className="text-link inline-text-link auth-inline-link" disabled={busy} onClick={() => onSwitch("forgot")}>
                  Forgot Password?
                </button>
              ) : null}
            </>
          ) : null}
          {isRegister ? (
            <div className="consent-stack">
              <label className="consent-item">
                <input type="checkbox" checked={registerConsentAccepted} onChange={onRegisterConsentToggle} />
                <span>
                  I agree to the{" "}
                  <button
                    type="button"
                    className="text-link inline-text-link"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenConsentDocument("privacy");
                    }}
                  >
                    Privacy Policy
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    className="text-link inline-text-link"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onOpenConsentDocument("terms");
                    }}
                  >
                    Terms of Use
                  </button>
                </span>
              </label>
            </div>
          ) : null}
          <div className="action-row">
            <button
              type="submit"
              disabled={
                busy ||
                (isLogin && (!formData.identifier.trim() || !formData.password)) ||
                (isRegister && (!formData.fullName.trim() || !formData.email.trim() || !formData.password || !registerConsentAccepted)) ||
                (isForgot && !formData.email.trim()) ||
                (isReset && (!formData.token.trim() || !formData.password))
              }
            >
              {busy ? "Working..." : isLogin ? "Sign in" : isRegister ? "Create account" : isForgot ? "Send reset email" : "Update password"}
            </button>
            {!isReset ? (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => onSwitch(isLogin ? "register" : "login")}
              >
                {isLogin ? "Need an account?" : "Back to sign in"}
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}

function CalendarPanel({
  accounts,
  loadingAccounts,
  message,
  onConnect,
  onDisconnect,
  timeline,
  timelineLoading,
  range,
  onRangeChange,
  onRefreshTimeline,
  eventForm,
  onEventChange,
  onToggleAccount,
  onCreateEvent,
  eventBusy,
  eventMessage,
  lastCalendarEventId,
  onUpdateEvent
}) {
  return (
    <div className="calendar-panel">
      <div className="section-heading">
        <div>
          <p className="section-kicker">Calendar</p>
          <h2>Availability and holds</h2>
        </div>
      </div>
      <div className="calendar-actions">
        <button type="button" className="secondary" onClick={() => onConnect("google")} disabled={loadingAccounts}>
          Connect Google Calendar
        </button>
        <button type="button" className="secondary" onClick={() => onConnect("microsoft")} disabled={loadingAccounts}>
          Connect Microsoft Calendar
        </button>
      </div>
      {message ? <p className="fine-print">{message}</p> : null}
      <div className="calendar-accounts">
        {loadingAccounts ? (
          <p className="fine-print">Loading connected calendars…</p>
        ) : accounts.length === 0 ? (
          <p className="fine-print">No calendars connected yet.</p>
        ) : (
          accounts.map((account) => {
            const label = account.displayName || account.display_name || account.email || "Connected account";
            return (
            <div key={account.id} className="calendar-account-row">
              <div>
                <strong>{account.provider}</strong>
                <span className="fine-print">{label}</span>
              </div>
              <button type="button" className="secondary danger" onClick={() => onDisconnect(account.id)}>
                Disconnect
              </button>
            </div>
          )})
        )}
      </div>
      <div className="calendar-timeline">
        <div className="calendar-range">
          <label className="field">
            <span>Start</span>
            <input type="datetime-local" name="start" value={range.start} onChange={onRangeChange} />
          </label>
          <label className="field">
            <span>End</span>
            <input type="datetime-local" name="end" value={range.end} onChange={onRangeChange} />
          </label>
          <button type="button" onClick={onRefreshTimeline} disabled={timelineLoading}>
            {timelineLoading ? "Refreshing…" : "Refresh timeline"}
          </button>
        </div>
        {timeline ? (
          <div className="calendar-grid">
            <div className="calendar-block">
              <h3>Busy blocks</h3>
              {timeline.busy?.length ? (
                timeline.busy.map((block, index) => (
                  <div key={`${block.start}-${block.end}-${index}`} className="calendar-item">
                    <strong>{formatDate(block.start)}</strong>
                    <span className="fine-print">to {formatDate(block.end)}</span>
                  </div>
                ))
              ) : (
                <p className="fine-print">No busy blocks found for this range.</p>
              )}
            </div>
            <div className="calendar-block">
              <h3>Free blocks</h3>
              {timeline.free?.length ? (
                timeline.free.map((block, index) => (
                  <div key={`${block.start}-${block.end}-${index}`} className="calendar-item">
                    <strong>{formatDate(block.start)}</strong>
                    <span className="fine-print">to {formatDate(block.end)}</span>
                  </div>
                ))
              ) : (
                <p className="fine-print">No free time found in this range.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="fine-print">Connect calendars to view the timeline.</p>
        )}
      </div>
      <form className="planner-form calendar-event-form" onSubmit={onCreateEvent}>
        <h3>Create or update a hold</h3>
        <div className="grid">
          <label className="field">
            <span>Title</span>
            <input name="title" value={eventForm.title} onChange={onEventChange} placeholder="Event hold" />
          </label>
          <label className="field">
            <span>Time zone</span>
            <input name="timeZone" value={eventForm.timeZone} onChange={onEventChange} placeholder="America/New_York" />
          </label>
          <label className="field">
            <span>Start</span>
            <input type="datetime-local" name="start" value={eventForm.start} onChange={onEventChange} />
          </label>
          <label className="field">
            <span>End</span>
            <input type="datetime-local" name="end" value={eventForm.end} onChange={onEventChange} />
          </label>
          <label className="field">
            <span>Location</span>
            <input name="location" value={eventForm.location} onChange={onEventChange} placeholder="Venue or city" />
          </label>
          <label className="field">
            <span>Description</span>
            <input name="description" value={eventForm.description} onChange={onEventChange} placeholder="Optional note" />
          </label>
        </div>
        <div className="calendar-account-picks">
          {accounts.length === 0 ? (
            <p className="fine-print">Connect a calendar to create a hold.</p>
          ) : (
            accounts.map((account) => (
              <label key={account.id} className="calendar-account-pick">
                <input
                  type="checkbox"
                  checked={eventForm.accountIds.includes(account.id)}
                  onChange={(event) => onToggleAccount(account.id, event.target.checked)}
                />
                <span>{account.provider} · {account.displayName || account.display_name || account.email}</span>
              </label>
            ))
          )}
        </div>
        {eventMessage ? <p className="fine-print">{eventMessage}</p> : null}
        <div className="action-row">
          <button type="submit" disabled={eventBusy}>
            {eventBusy ? "Saving…" : "Create hold"}
          </button>
          {lastCalendarEventId ? (
            <button type="button" className="secondary" onClick={onUpdateEvent} disabled={eventBusy}>
              Update last hold
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
}
