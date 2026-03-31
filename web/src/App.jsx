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

const publicPagePaths = {
  landing: "/",
  login: "/login",
  register: "/register",
  forgot: "/forgot-password",
  reset: "/reset-password"
};

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
    default:
      return "landing";
  }
}

function getAuthModeFromPublicPage(page) {
  return ["login", "register", "forgot", "reset"].includes(page) ? page : "login";
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
          <button type="submit" disabled={(mode === "home" ? analyzing : savingPlan) || !formData.brief.trim()}>
            {mode === "home" ? (analyzing ? "Analyzing..." : "Get ideas") : (savingPlan ? "Saving..." : "Save updates")}
          </button>
          {mode === "workspace" && editingPlanId ? (
            <button type="button" className="secondary" onClick={onResetEdit}>Cancel edit</button>
          ) : null}
          {mode === "workspace" && intake?.readiness === "ready-for-research" ? (
            <button type="button" className="secondary" disabled={savingPlan} onClick={onAdvance}>
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

function IntakeSection({ intake }) {
  return (
    <>
      {intake ? (
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

function MatchesSection({ plan, onFinalizeVendor, onSendInquiries, sendingInquiries }) {
  if (!plan) return null;
  const vendorGroups = groupVendorsByCategory(plan);
  const inquiries = plan.communication?.outboundMessages?.filter((message) => message.type === "inquiry") || [];
  const alreadySent = inquiries.length > 0;

  return (
    <section className="results">
      <div className="panel">
        <h2>Recommended matches</h2>
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
  onDeleteConfirm
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
              <input name="newPassword" type="password" value={passwordForm.newPassword} onChange={onPasswordChange} placeholder="12+ chars, upper, lower, number, symbol" />
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
  const [dashboardPlans, setDashboardPlans] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [intake, setIntake] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [sendingInquiries, setSendingInquiries] = useState(false);
  const [categorySaving, setCategorySaving] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [currentPage, setCurrentPage] = useState("home");
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
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
  const accountMenuRef = useRef(null);

  useEffect(() => {
    const resetToken = new URLSearchParams(window.location.search).get("resetToken");
    const nextPublicPage = getPublicPageFromLocation();
    const storedToken = window.localStorage.getItem(authStorageKey) || "";

    setPublicPage(nextPublicPage);
    setAuthMode(getAuthModeFromPublicPage(nextPublicPage));

    if (resetToken || nextPublicPage === "reset") {
      setAuthForm((current) => ({ ...current, token: resetToken }));
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
      setPublicPage(nextPublicPage);
      setAuthMode(getAuthModeFromPublicPage(nextPublicPage));
      setAuthMessage("");
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
    setAuthForm(emptyAuthForm);
    setAuthMessage("");
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

      window.localStorage.setItem(authStorageKey, payload.token);
      setSessionToken(payload.token);
      setUser(payload.user);
      setAuthForm(emptyAuthForm);
      setDashboardPlans([]);
      setCurrentPlan(null);
      setEditingPlanId(null);
      setCurrentPage("home");
      if (window.location.pathname !== publicPagePaths.landing || window.location.search) {
        window.history.replaceState({}, "", publicPagePaths.landing);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setAuthBusy(false);
    }
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

  function goToAccountPage(page) {
    setCurrentPage(page);
    setAccountMenuOpen(false);
  }

  async function handleAnalyze(event, nextPage = currentPage) {
    event.preventDefault();
    setAnalyzing(true);
    try {
      const nextIntake = await requestJson(`${apiBaseUrl}/api/intake`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(formData) }, "The API could not analyze the event.");
      setIntake(nextIntake);
      if (!editingPlanId) {
        setCurrentPlan(null);
      }
      if (currentPage === "home" && nextPage === "workspace") {
        setIsPageTransitioning(true);
        window.setTimeout(() => {
          setCurrentPage("workspace");
          setActiveStep(0);
          setIsPageTransitioning(false);
        }, 760);
      } else {
        setCurrentPage(nextPage);
        setActiveStep(0);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleContinue() {
    setSavingPlan(true);
    try {
      const plan = await requestJson(`${apiBaseUrl}/api/plans${editingPlanId ? `/${editingPlanId}` : ""}`, { method: editingPlanId ? "PUT" : "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify(formData) }, "The API could not generate a plan.");
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
      upsertPlan(plan);
      setActiveStep(1);
    } catch (error) {
      alert(error.message);
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleSavePlan(event) {
    event?.preventDefault();
    await handleContinue();
  }

  function handleResetEdit() {
    setEditingPlanId(null);
    setCurrentPlan(null);
    setIntake(null);
    setFormData(emptyForm);
    setActiveStep(0);
    setCurrentPage("home");
    setIsPageTransitioning(false);
  }

  function handleEditPlan(plan) {
    setEditingPlanId(plan.id);
    setCurrentPlan(plan);
    setIntake(buildEditorIntakeFromPlan(plan, "Loaded existing plan into the editor."));
    setFormData(eventFormFromPlan(plan));
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
    } catch (error) {
      alert(error.message);
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

    setCategorySaving(true);
    try {
      const updatedPlan = await requestJson(
        `${apiBaseUrl}/api/plans/${currentPlan.id}`,
        {
          method: "PUT",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            ...formData,
            selectedVendorCategories
          })
        },
        "Failed to update vendor categories"
      );
      setCurrentPlan(updatedPlan);
      upsertPlan(updatedPlan);
    } catch (error) {
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
    await handleAnalyze(event, "workspace");
  }

  async function handleFinalizeVendor(vendorId) {
    if (!currentPlan) return;
    try {
      const updatedPlan = await requestJson(`${apiBaseUrl}/api/plans/${currentPlan.id}/finalize`, { method: "POST", headers: authHeaders({ "Content-Type": "application/json" }), body: JSON.stringify({ vendorId }) }, "Failed to finalize vendor");
      setCurrentPlan(updatedPlan);
      upsertPlan(updatedPlan);
    } catch (error) {
      alert(error.message);
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
    return (
      <main className="shell public-shell">
        <section className="topbar public-topbar">
          <div>
            <p className="eyebrow">AI Event Planner</p>
            <h1>{publicPage === "landing" ? "Plan the event. Let the app run the work." : "Account access"}</h1>
          </div>
          <div className="public-auth-actions">
            <button type="button" className="secondary" onClick={() => navigatePublicPage("login")}>Login</button>
            <button type="button" onClick={() => navigatePublicPage("register")}>Register</button>
          </div>
        </section>
        {publicPage === "landing" ? (
          <LandingPage onLogin={() => navigatePublicPage("login")} onRegister={() => navigatePublicPage("register")} />
        ) : (
          <AuthSection
            mode={authMode}
            formData={authForm}
            busy={authBusy}
            message={authMessage}
            onChange={handleAuthFieldChange}
            onSubmit={handleAuthSubmit}
            onSwitch={navigatePublicPage}
            onHome={() => navigatePublicPage("landing")}
          />
        )}
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="topbar">
        {(currentPage === "profile" || currentPage === "settings") ? (
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
                settings: "Settings"
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
                <button type="button" className="account-menu-item" onClick={() => { setAccountMenuOpen(false); handleLogout(); }}>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {currentPage === "home" ? (
        <div className={`home-stage ${isPageTransitioning ? "is-transitioning" : ""}`}>
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
              <IntakeSection intake={intake} />
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
          />
        </section>
      )}
    </main>
  );
}

function LandingPage({ onLogin, onRegister }) {
  return (
    <section className="landing-page">
      <div className="landing-hero panel">
        <div className="landing-hero-copy">
          <p className="section-kicker">Automated event operations</p>
          <h2>Brief once. Source vendors, send outreach, and track replies from one workspace.</h2>
          <p className="landing-lead">
            AI Event Planner turns a rough event idea into a working plan with vendor categories, recommended matches,
            outreach drafts, and a live operations dashboard your team can actually use.
          </p>
          <div className="landing-cta-row">
            <button type="button" onClick={onRegister}>Create an account</button>
            <button type="button" className="secondary" onClick={onLogin}>Sign in</button>
          </div>
          <div className="landing-proof-strip">
            <span>Vendor recommendations by category</span>
            <span>Inbox-ready outreach drafts</span>
            <span>Reply tracking and final selection</span>
          </div>
        </div>
        <div className="landing-hero-card">
          <div className="landing-mini-card">
            <span className="metric-label">Event status</span>
            <strong>Plan ready in minutes</strong>
            <p>Move from intake to shortlist, outreach, and final vendor selection without juggling spreadsheets.</p>
          </div>
          <div className="landing-mini-grid">
            <div className="metric-card">
              <span className="metric-label">Vendors shortlisted</span>
              <strong>12</strong>
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

      <div className="landing-grid">
        <article className="panel landing-feature-card">
          <p className="section-kicker">For busy planners</p>
          <h3>Start with a loose brief</h3>
          <p className="fine-print">Describe the event in plain language and the app structures the intake, budget, dates, theme, and guest requirements.</p>
        </article>
        <article className="panel landing-feature-card">
          <p className="section-kicker">For vendor sourcing</p>
          <h3>Get curated matches fast</h3>
          <p className="fine-print">Recommended vendor groups stay tied to the event direction so your shortlist is easier to review and action.</p>
        </article>
        <article className="panel landing-feature-card">
          <p className="section-kicker">For execution</p>
          <h3>Keep outreach moving</h3>
          <p className="fine-print">Draft inquiries, send outreach, monitor replies, and finalize the right fit without losing context between tools.</p>
        </article>
      </div>
    </section>
  );
}

function AuthSection({ mode, formData, busy, message, onChange, onSubmit, onSwitch, onHome }) {
  const isLogin = mode === "login";
  const isRegister = mode === "register";
  const isForgot = mode === "forgot";
  const isReset = mode === "reset";

  return (
    <section className="auth-shell">
      <div className="panel auth-panel">
        <div className="auth-panel-topline">
          <button type="button" className="secondary" onClick={onHome}>Back to home</button>
        </div>
        <p className="section-kicker">Account</p>
        <h2>{isLogin ? "Sign in" : isRegister ? "Create account" : isForgot ? "Reset password" : "Choose a new password"}</h2>
        <p className="fine-print">
          {isLogin
            ? "Sign in with your email or username to access your event plans and replies."
            : isRegister
              ? "Register with your full name and email. The app will generate a unique username for your reply mailbox."
              : isForgot
                ? "Enter your email address and we will send a reset message."
                : "Paste the reset token from your email and choose a strong new password."}
        </p>
        {message ? <p className="fine-print">{message}</p> : null}
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
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                value={formData.password}
                onChange={onChange}
                placeholder="12+ chars, upper, lower, number, symbol"
                autoComplete={isLogin ? "current-password" : "new-password"}
              />
            </label>
          ) : null}
          <div className="action-row">
            <button
              type="submit"
              disabled={
                busy ||
                (isLogin && (!formData.identifier.trim() || !formData.password)) ||
                (isRegister && (!formData.fullName.trim() || !formData.email.trim() || !formData.password)) ||
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
            {isLogin ? (
              <button type="button" className="secondary" disabled={busy} onClick={() => onSwitch("forgot")}>
                Forgot password
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </section>
  );
}
