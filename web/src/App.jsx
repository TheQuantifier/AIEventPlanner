import { useEffect, useRef, useState } from "react";

const apiBaseUrl = __API_BASE_URL__;

const emptyForm = {
  brief: "",
  budget: "",
  location: "",
  dates: "",
  theme: "",
  guestCount: ""
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
    budget: plan.event?.budgetLabel || String(plan.event?.budget || ""),
    location: plan.event?.location || "",
    dates: plan.event?.dateWindow || "",
    theme: plan.event?.theme || "",
    guestCount: String(plan.event?.guestCount || "")
  };
}

function buildPlanSummary(plan) {
  return [
    ["Event", plan.event.type],
    ["Theme", plan.event.theme || "Open"],
    ["Budget", plan.event.budgetLabel],
    ["Where", plan.event.location],
    ["When", plan.event.dateWindow],
    ["Guests", plan.event.guestCount]
  ];
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

function buildInquiryPreview(event, vendor, replyTo) {
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
      replyTo ? `You can reply directly to: ${replyTo}` : "",
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
        {mode === "workspace" && editingPlanId ? <div className="editor-state">Editing {getEventDisplayName(currentPlan) || "event"} | {editingPlanId}</div> : null}
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

function DirectionSection({ plan, intake, onShowVendors }) {
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
  const shortlist = Array.isArray(plan.shortlist) ? plan.shortlist : [];
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
        {shortlist.length === 0 ? (
          <div className="follow-up-item">No recommended matches yet. Save the event direction to generate options.</div>
        ) : (
          <div className="shortlist">
            {shortlist.map((vendor) => (
              <article key={vendor.id} className="vendor-card">
                {(() => {
                  const inquiryPreview = buildInquiryPreview(plan.event, vendor, plan.communication?.replyTo || "");
                  return (
                    <>
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
                    </>
                  );
                })()}
              </article>
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

export default function App() {
  const [dashboardPlans, setDashboardPlans] = useState([]);
  const [formData, setFormData] = useState(emptyForm);
  const [intake, setIntake] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [sendingInquiries, setSendingInquiries] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [currentPage, setCurrentPage] = useState("home");
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);

  useEffect(() => {
    loadDashboardPlans();
  }, []);

  async function loadDashboardPlans() {
    try {
      const payload = await requestJson(`${apiBaseUrl}/api/plans`, {}, "Failed to load events");
      setDashboardPlans(sortPlans(Array.isArray(payload.items) ? payload.items : []));
    } catch (error) {
      alert(error.message);
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

  async function handleAnalyze(event, nextPage = currentPage) {
    event.preventDefault();
    setAnalyzing(true);
    try {
      const nextIntake = await requestJson(`${apiBaseUrl}/api/intake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) }, "The API could not analyze the event.");
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
      const plan = await requestJson(`${apiBaseUrl}/api/plans${editingPlanId ? `/${editingPlanId}` : ""}`, { method: editingPlanId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) }, "The API could not generate a plan.");
      setCurrentPlan(plan);
      setEditingPlanId(plan.id);
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
    setIntake({ eventType: plan.event.type, readiness: "ready-for-research", missingFields: [], followUpQuestions: [], suggestions: plan.event.suggestions || [], assistantMessage: "Loaded existing plan into the editor." });
    setFormData(eventFormFromPlan(plan));
    setActiveStep(1);
    setCurrentPage("workspace");
  }

  async function handleTogglePause(plan) {
    try {
      const updatedPlan = await requestJson(`${apiBaseUrl}/api/plans/${plan.id}/pause`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paused: !plan.isPaused }) }, "Failed to update pause state");
      upsertPlan(updatedPlan);
      if (currentPlan?.id === updatedPlan.id) setCurrentPlan(updatedPlan);
    } catch (error) {
      alert(error.message);
    }
  }

  async function handleDeletePlan(plan) {
    try {
      await requestJson(`${apiBaseUrl}/api/plans/${plan.id}`, { method: "DELETE" }, "Failed to delete event");
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
      const updatedPlan = await requestJson(`${apiBaseUrl}/api/plans/${currentPlan.id}/send-inquiries`, { method: "POST", headers: { "Content-Type": "application/json" } }, "Failed to send inquiry emails");
      setCurrentPlan(updatedPlan);
      upsertPlan(updatedPlan);
    } catch (error) {
      alert(error.message);
    } finally {
      setSendingInquiries(false);
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
      const updatedPlan = await requestJson(`${apiBaseUrl}/api/plans/${currentPlan.id}/finalize`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vendorId }) }, "Failed to finalize vendor");
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

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">AI Event Planner</p>
          <h1>{currentPage === "home" ? "Operations dashboard" : "Event workspace"}</h1>
        </div>
        <div className="topbar-actions">
          {currentPage === "workspace" ? (
            <button type="button" className="secondary" onClick={() => setCurrentPage("home")}>
              Back to dashboard
            </button>
          ) : null}
          <div className="topbar-badge">Workflow orchestration for live event plans</div>
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
      ) : (
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
      )}
    </main>
  );
}
