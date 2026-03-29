import { useEffect, useState } from "react";

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

function SystemStatus({ integrations }) {
  if (!integrations) return null;

  const stageClass = integrations.app?.testing ? "status-card status-card-warning" : "status-card";
  const mailbox = integrations.emailClient?.testRecipient || "not configured";

  return (
    <div className="system-status">
      <div className={stageClass}>
        <strong>Stage: {integrations.app?.stage || "development"}</strong>
        <br />
        {integrations.app?.testing
          ? `Outbound vendor email is rerouted to the app inbox: ${mailbox}.`
          : "Outbound vendor email is configured for direct delivery."}
      </div>
      <div className="status-grid">
        <div className="status-card">
          <strong>Email</strong>
          <br />
          {integrations.emailClient?.configured ? integrations.emailClient.deliveryMode : "not configured"}
        </div>
        <div className="status-card">
          <strong>Database</strong>
          <br />
          {integrations.db?.configured ? integrations.db.provider || "configured" : "not configured"}
        </div>
        <div className="status-card">
          <strong>AI</strong>
          <br />
          {integrations.ai?.configured ? integrations.ai.provider || "configured" : "using fallback planner"}
        </div>
      </div>
    </div>
  );
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
                    <strong>{plan.event?.type || "Event"}</strong>
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

function IntakeSection({ formData, onChange, onAnalyze, onContinue, onResetEdit, intake, editingPlanId, currentPlan, analyzing, savingPlan }) {
  return (
    <>
      <section className="panel intake-panel">
        <div className="section-heading">
          <div>
            <p className="section-kicker">Composer</p>
            <h2>Create or update event</h2>
          </div>
          {editingPlanId ? <div className="editor-state">Editing {currentPlan?.event?.type || "event"} | {editingPlanId}</div> : null}
        </div>
        <form className="planner-form" onSubmit={onAnalyze}>
          <label className="field field-large">
            <span>What are you planning?</span>
            <textarea name="brief" value={formData.brief} onChange={onChange} placeholder="Example: I want a stylish company dinner for 80 people in Chicago this fall." />
          </label>
          <div className="grid">
            <label className="field"><span>Budget</span><input name="budget" value={formData.budget} onChange={onChange} placeholder="$12,000" /></label>
            <label className="field"><span>Location</span><input name="location" value={formData.location} onChange={onChange} placeholder="Chicago" /></label>
            <label className="field"><span>Dates</span><input name="dates" value={formData.dates} onChange={onChange} placeholder="June 10 to June 14" /></label>
            <label className="field"><span>Theme</span><input name="theme" value={formData.theme} onChange={onChange} placeholder="Minimal, garden party, modern luxury" /></label>
            <label className="field"><span>Guest count</span><input name="guestCount" type="number" min="1" value={formData.guestCount} onChange={onChange} placeholder="100" /></label>
          </div>
          <div className="action-row">
            <button type="submit" disabled={analyzing}>{analyzing ? "Analyzing..." : "Get ideas"}</button>
            {editingPlanId ? <button type="button" className="secondary" onClick={onResetEdit}>Cancel edit</button> : null}
            {intake?.readiness === "ready-for-research" ? (
              <button type="button" className="secondary" disabled={savingPlan} onClick={onContinue}>
                {savingPlan ? "Saving..." : "See recommendations"}
              </button>
            ) : null}
          </div>
        </form>
      </section>
      {intake ? (
        <section className="panel">
          <h2>Planner notes</h2>
          <div className="summary"><p>{intake.assistantMessage}</p></div>
          <div className="suggestions">
            <span className="chip">Detected event type: {intake.eventType}</span>
            {intake.suggestions.map((item) => <span key={item} className="chip">{item}</span>)}
          </div>
          <div className="follow-up-list">
            {intake.followUpQuestions.length === 0
              ? <div className="follow-up-item">All required intake details are present. You can continue to vendor research.</div>
              : intake.followUpQuestions.map((item) => (
                  <div key={`${item.field}-${item.question}`} className="follow-up-item">
                    <strong>{item.field}</strong><br />{item.question}
                  </div>
                ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function ResultsSection({ plan, onSendInquiries, onFinalizeVendor, sendingInquiries }) {
  if (!plan) return null;

  const inquiries = plan.communication?.outboundMessages?.filter((message) => message.type === "inquiry") || [];
  const outboundMessages = plan.communication?.outboundMessages || [];
  const inboundMessages = plan.communication?.inboundMessages || [];
  const alreadySent = inquiries.length > 0;

  return (
    <section className="results">
      <div className="panel">
        <h2>Your event direction</h2>
        <div className="summary">
          {buildPlanSummary(plan).map(([label, value]) => <p key={label}><strong>{label}:</strong> {value}</p>)}
          {plan.event.plannerSummary ? <p>{plan.event.plannerSummary}</p> : null}
        </div>
        {plan.event.suggestions?.length ? <div className="suggestions">{plan.event.suggestions.map((item) => <span key={item} className="chip">{item}</span>)}</div> : null}
        <div className="action-row section-actions">
          <button type="button" disabled={plan.isPaused || alreadySent || sendingInquiries} onClick={onSendInquiries}>
            {plan.isPaused ? "Event paused" : sendingInquiries ? "Sending inquiries..." : alreadySent ? "Outreach already handled" : "Start outreach"}
          </button>
        </div>
        {inquiries.length ? (
          <div className="follow-up-list">
            {inquiries.map((message) => {
              const vendorName = plan.shortlist.find((vendor) => vendor.id === message.vendorId)?.name || message.vendorId;
              const intendedRecipient = message.delivery?.intendedRecipient || message.intendedRecipient || "unknown";
              const deliveredTo = message.delivery?.deliveredTo || message.deliveredTo || intendedRecipient;
              return <div key={message.id} className="follow-up-item"><strong>{vendorName}</strong><br />{message.delivery.ok ? `Outreach sent to ${deliveredTo}.${deliveredTo !== intendedRecipient ? ` Intended vendor: ${intendedRecipient}.` : ""}` : "This option could not be contacted yet."}</div>;
            })}
          </div>
        ) : null}
      </div>
      <div className="panel">
        <h2>Recommended matches</h2>
        <div className="shortlist">
          {plan.shortlist.map((vendor) => (
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
                <p className="fine-print">To: {vendor.inquiryEmail.to}</p>
                <p className="fine-print">Subject: {vendor.inquiryEmail.subject}</p>
                <pre>{vendor.inquiryEmail.body}</pre>
              </details>
              <button type="button" disabled={plan.finalSelection?.vendorId === vendor.id || plan.isPaused} onClick={() => onFinalizeVendor(vendor.id)}>
                {plan.finalSelection?.vendorId === vendor.id ? "Chosen" : "Choose this option"}
              </button>
            </article>
          ))}
        </div>
      </div>
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
  const [systemStatus, setSystemStatus] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [intake, setIntake] = useState(null);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [editingPlanId, setEditingPlanId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [sendingInquiries, setSendingInquiries] = useState(false);

  useEffect(() => {
    loadDashboardPlans();
    loadSystemStatus();
  }, []);

  async function loadDashboardPlans() {
    try {
      const payload = await requestJson(`${apiBaseUrl}/api/plans`, {}, "Failed to load events");
      setDashboardPlans(sortPlans(Array.isArray(payload.items) ? payload.items : []));
    } catch (error) {
      alert(error.message);
    }
  }

  async function loadSystemStatus() {
    try {
      const payload = await requestJson(`${apiBaseUrl}/health`, {}, "Status request failed");
      setSystemStatus(payload.integrations);
    } catch {
      setSystemStatus(null);
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

  async function handleAnalyze(event) {
    event.preventDefault();
    setAnalyzing(true);
    try {
      const nextIntake = await requestJson(`${apiBaseUrl}/api/intake`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formData) }, "The API could not analyze the event.");
      setIntake(nextIntake);
      setCurrentPlan(null);
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
    } catch (error) {
      alert(error.message);
    } finally {
      setSavingPlan(false);
    }
  }

  function handleResetEdit() {
    setEditingPlanId(null);
    setCurrentPlan(null);
    setIntake(null);
    setFormData(emptyForm);
  }

  function handleEditPlan(plan) {
    setEditingPlanId(plan.id);
    setCurrentPlan(plan);
    setIntake({ eventType: plan.event.type, readiness: "ready-for-research", missingFields: [], followUpQuestions: [], suggestions: plan.event.suggestions || [], assistantMessage: "Loaded existing plan into the editor." });
    setFormData(eventFormFromPlan(plan));
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

  return (
    <main className="shell">
      <section className="topbar">
        <div><p className="eyebrow">AI Event Planner</p><h1>Operations dashboard</h1></div>
        <div className="topbar-badge">Workflow orchestration for live event plans</div>
      </section>
      <section className="dashboard-grid">
        <DashboardSection plans={dashboardPlans} onEdit={handleEditPlan} onPause={handleTogglePause} onDelete={handleDeletePlan} />
        <section className="hero"><SystemStatus integrations={systemStatus} /></section>
      </section>
      <IntakeSection formData={formData} onChange={handleFieldChange} onAnalyze={handleAnalyze} onContinue={handleContinue} onResetEdit={handleResetEdit} intake={intake} editingPlanId={editingPlanId} currentPlan={currentPlan} analyzing={analyzing} savingPlan={savingPlan} />
      <ResultsSection plan={currentPlan} onSendInquiries={handleSendInquiries} onFinalizeVendor={handleFinalizeVendor} sendingInquiries={sendingInquiries} />
    </main>
  );
}
