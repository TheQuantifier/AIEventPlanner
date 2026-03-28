const apiBaseUrl = window.AI_EVENT_PLANNER_CONFIG?.apiBaseUrl || "http://localhost:4000";

const form = document.querySelector("#planner-form");
const continueButton = document.querySelector("#continue-button");
const resetEditorButton = document.querySelector("#reset-editor-button");
const intakeResults = document.querySelector("#intake-results");
const systemStatus = document.querySelector("#system-status");
const editorState = document.querySelector("#editor-state");
const assistantMessage = document.querySelector("#assistant-message");
const detectedType = document.querySelector("#detected-type");
const followUpQuestions = document.querySelector("#follow-up-questions");
const results = document.querySelector("#results");
const summary = document.querySelector("#event-summary");
const suggestions = document.querySelector("#suggestions");
const sendInquiriesButton = document.querySelector("#send-inquiries-button");
const outreachStatus = document.querySelector("#outreach-status");
const shortlist = document.querySelector("#shortlist");
const messageLog = document.querySelector("#message-log");
const inboundLog = document.querySelector("#inbound-log");
const selectionStatus = document.querySelector("#selection-status");
const eventsDashboard = document.querySelector("#events-dashboard");
const metricTotalEvents = document.querySelector("#metric-total-events");
const metricNeedsAction = document.querySelector("#metric-needs-action");
const metricPaused = document.querySelector("#metric-paused");

let currentPlan = null;
let editingPlanId = null;
let dashboardPlans = [];

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatDate(value) {
  if (!value) {
    return "";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString();
}

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

async function requestJson(url, options = {}, fallbackMessage = "Request failed") {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || payload.details || fallbackMessage);
  }

  return payload;
}

function sortDashboardPlans() {
  dashboardPlans.sort((left, right) => {
    const leftTime = new Date(left.updatedAt || left.createdAt || 0).getTime();
    const rightTime = new Date(right.updatedAt || right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function upsertDashboardPlan(plan) {
  const index = dashboardPlans.findIndex((item) => item.id === plan.id);

  if (index >= 0) {
    dashboardPlans[index] = plan;
  } else {
    dashboardPlans.push(plan);
  }

  sortDashboardPlans();
  renderDashboard();
}

function removeDashboardPlan(planId) {
  dashboardPlans = dashboardPlans.filter((item) => item.id !== planId);
  renderDashboard();
}

function getProgressLabel(plan) {
  if (plan.isPaused) {
    return "Paused";
  }

  const labels = {
    "awaiting-user-selection": "Plan ready",
    "vendor-inquiries-sent": "Outreach running",
    "vendor-confirmed": "Confirmed"
  };

  return labels[plan.workflowState] || "Draft";
}

function getActionStatus(plan) {
  if (plan.isPaused) {
    return {
      tone: "muted",
      label: "Paused",
      detail: "Workflow is paused until resumed."
    };
  }

  if (plan.finalSelection) {
    return {
      tone: "good",
      label: "Stable",
      detail: "Vendor selected and confirmation prepared."
    };
  }

  if ((plan.communication?.outboundMessages || []).length === 0) {
    return {
      tone: "warn",
      label: "Action needed",
      detail: "Review the plan and start outreach."
    };
  }

  const repliedCount = plan.automation?.vendorRepliesReceived || 0;
  if (repliedCount === 0) {
    return {
      tone: "warn",
      label: "Action needed",
      detail: "Waiting on vendors; follow-up may be needed."
    };
  }

  return {
    tone: "good",
    label: "In progress",
    detail: `${repliedCount} vendor reply${repliedCount === 1 ? "" : "ies"} recorded.`
  };
}

function summarizePlan(plan) {
  return [
    plan.event?.type || "event",
    plan.event?.location || "Flexible",
    plan.event?.dateWindow || "Flexible dates"
  ].filter(Boolean).join(" | ");
}

function setFormValues(payload = {}) {
  document.querySelector("#brief").value = payload.brief || "";
  document.querySelector("#budget").value = payload.budget || "";
  document.querySelector("#location").value = payload.location || "";
  document.querySelector("#dates").value = payload.dates || "";
  document.querySelector("#theme").value = payload.theme || "";
  document.querySelector("#guestCount").value = payload.guestCount || "";
}

function renderSystemStatus(integrations) {
  if (!integrations) {
    systemStatus.classList.add("hidden");
    systemStatus.innerHTML = "";
    return;
  }

  const stage = integrations.app?.stage || "development";
  const deliveryMode = integrations.emailClient?.deliveryMode || "unknown";
  const mailbox = integrations.emailClient?.testRecipient || "not configured";
  const stageClass = integrations.app?.testing ? "status-card status-card-warning" : "status-card";

  systemStatus.classList.remove("hidden");
  systemStatus.innerHTML = `
    <div class="${stageClass}">
      <strong>Stage: ${escapeHtml(stage)}</strong><br>
      ${integrations.app?.testing ? `Outbound vendor email is rerouted to the app inbox: ${escapeHtml(mailbox)}.` : "Outbound vendor email is configured for direct delivery."}
    </div>
    <div class="status-grid">
      <div class="status-card">
        <strong>Email</strong><br>
        ${escapeHtml(integrations.emailClient?.configured ? deliveryMode : "not configured")}
      </div>
      <div class="status-card">
        <strong>Database</strong><br>
        ${integrations.db?.configured ? escapeHtml(integrations.db.provider || "configured") : "not configured"}
      </div>
      <div class="status-card">
        <strong>AI</strong><br>
        ${integrations.ai?.configured ? escapeHtml(integrations.ai.provider || "configured") : "using fallback planner"}
      </div>
    </div>
  `;
}

function renderSuggestions(items) {
  if (!items.length) {
    suggestions.innerHTML = "";
    return;
  }

  suggestions.innerHTML = `
    <h3>Suggested directions</h3>
    ${items.map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join("")}
  `;
}

function renderIntake(intake) {
  intakeResults.classList.remove("hidden");
  assistantMessage.innerHTML = `<p>${escapeHtml(intake.assistantMessage)}</p>`;
  detectedType.innerHTML = `<span class="chip">Detected event type: ${escapeHtml(intake.eventType)}</span>`;

  if (intake.suggestions.length > 0) {
    detectedType.innerHTML += intake.suggestions
      .map((item) => `<span class="chip">${escapeHtml(item)}</span>`)
      .join("");
  }

  if (intake.followUpQuestions.length === 0) {
    followUpQuestions.innerHTML = `
      <div class="follow-up-item">
        All required intake details are present. You can continue to vendor research.
      </div>
    `;
  } else {
    followUpQuestions.innerHTML = intake.followUpQuestions
      .map(
        (item) => `
          <div class="follow-up-item">
            <strong>${escapeHtml(item.field)}</strong><br>
            ${escapeHtml(item.question)}
          </div>
        `
      )
      .join("");
  }

  continueButton.classList.toggle("hidden", intake.readiness !== "ready-for-research");
}

function renderSelectionStatus(plan) {
  if (!plan.finalSelection) {
    selectionStatus.classList.add("hidden");
    selectionStatus.innerHTML = "";
    return;
  }

  selectionStatus.classList.remove("hidden");
  selectionStatus.innerHTML = `
    <h2>Selection saved</h2>
    <p>${escapeHtml(plan.finalSelection.vendorName || "Your chosen option")} is marked as the preferred fit for this event.</p>
    <p class="fine-print">Confirmation created ${escapeHtml(formatDate(plan.finalSelection.selectedAt))}.</p>
  `;
}

function renderOutreachStatus(plan) {
  const inquiries = plan.communication?.outboundMessages?.filter((message) => message.type === "inquiry") || [];

  if (inquiries.length === 0) {
    outreachStatus.classList.add("hidden");
    outreachStatus.innerHTML = "";
    return;
  }

  outreachStatus.classList.remove("hidden");
  outreachStatus.innerHTML = inquiries
    .map((message) => {
      const vendorName = plan.shortlist.find((vendor) => vendor.id === message.vendorId)?.name || message.vendorId;
      const intendedRecipient = message.delivery?.intendedRecipient || message.intendedRecipient || "unknown";
      const deliveredTo = message.delivery?.deliveredTo || message.deliveredTo || intendedRecipient;
      return `
        <div class="follow-up-item">
          <strong>${escapeHtml(vendorName)}</strong><br>
          ${
            message.delivery.ok
              ? `Outreach sent to ${escapeHtml(deliveredTo)}.${deliveredTo !== intendedRecipient ? ` Intended vendor: ${escapeHtml(intendedRecipient)}.` : ""}`
              : "This option could not be contacted yet."
          }
        </div>
      `;
    })
    .join("");
}

function renderCommunicationLog(plan) {
  const outboundMessages = plan.communication?.outboundMessages || [];
  const inboundMessages = plan.communication?.inboundMessages || [];

  messageLog.innerHTML = outboundMessages.length
    ? outboundMessages
        .map((message) => {
          const vendorName = plan.shortlist.find((vendor) => vendor.id === message.vendorId)?.name || message.vendorId || "Vendor";
          return `
            <div class="follow-up-item">
              <strong>${escapeHtml(message.type === "confirmation" ? "Confirmation" : "Inquiry")} | ${escapeHtml(vendorName)}</strong><br>
              ${escapeHtml(message.subject || "No subject")}<br>
              <span class="fine-print">${escapeHtml(formatDate(message.createdAt))}</span><br>
              <span class="fine-print">Delivered to: ${escapeHtml(message.delivery?.deliveredTo || message.deliveredTo || "not sent")}</span>
              ${message.delivery?.intendedRecipient && message.delivery?.intendedRecipient !== message.delivery?.deliveredTo ? `<br><span class="fine-print">Intended vendor: ${escapeHtml(message.delivery.intendedRecipient)}</span>` : ""}
            </div>
          `;
        })
        .join("")
    : `<div class="follow-up-item">No outbound email has been sent yet.</div>`;

  inboundLog.innerHTML = inboundMessages.length
    ? inboundMessages
        .map((message) => {
          const vendorName = plan.shortlist.find((vendor) => vendor.id === message.vendorId)?.name || message.from || "Unknown sender";
          return `
            <div class="follow-up-item">
              <strong>Reply | ${escapeHtml(vendorName)}</strong><br>
              ${escapeHtml(message.subject || "No subject")}<br>
              <span class="fine-print">${escapeHtml(formatDate(message.receivedAt))}</span>
              <p>${escapeHtml(message.text || "No message body supplied.")}</p>
            </div>
          `;
        })
        .join("")
    : `<div class="follow-up-item">No vendor replies have been recorded yet.</div>`;
}

function renderShortlist(plan) {
  shortlist.innerHTML = plan.shortlist
    .map(
      (vendor) => `
        <article class="vendor-card">
          <div class="vendor-topline">
            <div>
              <p class="eyebrow">Option ${escapeHtml(vendor.rank)}</p>
              <h3>${escapeHtml(vendor.name)}</h3>
            </div>
            <div class="vendor-price-block">
              <strong>${currency(vendor.estimatedQuote)}</strong>
              <span class="status-pill status-${escapeHtml(vendor.status)}">${escapeHtml(vendor.status)}</span>
            </div>
          </div>
          <div class="vendor-meta">
            <span>${escapeHtml(vendor.category)}</span>
            <span>${escapeHtml(vendor.serviceArea.join(", "))}</span>
            <span>${escapeHtml(vendor.rating)}/5</span>
            <span>Score ${escapeHtml(vendor.score)}</span>
          </div>
          <p>${escapeHtml(vendor.summary)}</p>
          <p class="fine-print">Primary contact: ${escapeHtml(vendor.email)}</p>
          <details class="email-preview">
            <summary>Preview inquiry email</summary>
            <p class="fine-print">To: ${escapeHtml(vendor.inquiryEmail.to)}</p>
            <p class="fine-print">Subject: ${escapeHtml(vendor.inquiryEmail.subject)}</p>
            <pre>${escapeHtml(vendor.inquiryEmail.body)}</pre>
          </details>
          <button type="button" data-vendor-id="${vendor.id}" ${plan.finalSelection?.vendorId === vendor.id || plan.isPaused ? "disabled" : ""}>${plan.finalSelection?.vendorId === vendor.id ? "Chosen" : "Choose this option"}</button>
        </article>
      `
    )
    .join("");

  shortlist.querySelectorAll("button[data-vendor-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Saving...";

      try {
        await finalizeVendor(button.dataset.vendorId);
        button.textContent = "Chosen";
      } catch (error) {
        button.disabled = false;
        button.textContent = "Choose this option";
        alert(error.message);
      }
    });
  });
}

function renderPlanSummary(plan) {
  summary.innerHTML = `
    <p><strong>Event:</strong> ${escapeHtml(plan.event.type)}</p>
    <p><strong>Theme:</strong> ${escapeHtml(plan.event.theme || "Open")}</p>
    <p><strong>Budget:</strong> ${escapeHtml(plan.event.budgetLabel)}</p>
    <p><strong>Where:</strong> ${escapeHtml(plan.event.location)}</p>
    <p><strong>When:</strong> ${escapeHtml(plan.event.dateWindow)}</p>
    <p><strong>Guests:</strong> ${escapeHtml(plan.event.guestCount)}</p>
    ${plan.event.plannerSummary ? `<p>${escapeHtml(plan.event.plannerSummary)}</p>` : ""}
  `;
}

function loadPlanIntoEditor(plan) {
  editingPlanId = plan.id;
  currentPlan = plan;
  setFormValues({
    brief: plan.event?.brief || "",
    budget: plan.event?.budgetLabel || plan.event?.budget || "",
    location: plan.event?.location || "",
    dates: plan.event?.dateWindow || "",
    theme: plan.event?.theme || "",
    guestCount: plan.event?.guestCount || ""
  });
  editorState.classList.remove("hidden");
  editorState.textContent = `Editing ${plan.event?.type || "event"} | ${plan.id}`;
  resetEditorButton.classList.remove("hidden");
  results.classList.remove("hidden");
  renderPlanSummary(plan);
  renderSuggestions(plan.event?.suggestions || []);
  renderOutreachStatus(plan);
  renderShortlist(plan);
  renderSelectionStatus(plan);
  renderCommunicationLog(plan);

  const alreadySent = Boolean(plan.communication?.outboundMessages?.some((message) => message.type === "inquiry"));
  sendInquiriesButton.classList.remove("hidden");
  sendInquiriesButton.disabled = plan.isPaused || alreadySent;
  sendInquiriesButton.textContent = plan.isPaused ? "Event paused" : alreadySent ? "Outreach already handled" : "Start outreach";
}

function clearEditor() {
  editingPlanId = null;
  currentPlan = null;
  form.reset();
  intakeResults.classList.add("hidden");
  results.classList.add("hidden");
  continueButton.classList.add("hidden");
  resetEditorButton.classList.add("hidden");
  editorState.classList.add("hidden");
  editorState.textContent = "";
}

function renderDashboard() {
  const needsActionCount = dashboardPlans.filter((plan) => getActionStatus(plan).label === "Action needed").length;
  const pausedCount = dashboardPlans.filter((plan) => plan.isPaused).length;

  metricTotalEvents.textContent = String(dashboardPlans.length);
  metricNeedsAction.textContent = String(needsActionCount);
  metricPaused.textContent = String(pausedCount);

  if (dashboardPlans.length === 0) {
    eventsDashboard.innerHTML = `
      <div class="dashboard-empty">
        <strong>No tracked events yet.</strong>
        <p>Create an event plan to populate the dashboard.</p>
      </div>
    `;
    return;
  }

  eventsDashboard.innerHTML = dashboardPlans
    .map((plan) => {
      const action = getActionStatus(plan);
      return `
        <article class="event-row">
          <div class="event-main">
            <div class="event-title-row">
              <strong>${escapeHtml(plan.event?.type || "Event")}</strong>
              <span class="table-pill">${escapeHtml(getProgressLabel(plan))}</span>
            </div>
            <div class="event-meta">${escapeHtml(summarizePlan(plan))}</div>
          </div>
          <div class="event-status">
            <span class="table-status table-status-${escapeHtml(action.tone)}">${escapeHtml(action.label)}</span>
            <span class="event-detail">${escapeHtml(action.detail)}</span>
          </div>
          <div class="event-actions">
            <button type="button" class="icon-button secondary" data-dashboard-action="edit" data-plan-id="${plan.id}" aria-label="Edit event">&#128221;</button>
            <button type="button" class="icon-button secondary" data-dashboard-action="pause" data-plan-id="${plan.id}" aria-label="${plan.isPaused ? "Resume event" : "Pause event"}">&#9208;</button>
            <button type="button" class="icon-button secondary danger" data-dashboard-action="delete" data-plan-id="${plan.id}" aria-label="Delete event">&#128465;</button>
          </div>
        </article>
      `;
    })
    .join("");

  eventsDashboard.querySelectorAll("[data-dashboard-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const { dashboardAction, planId } = button.dataset;
      const plan = dashboardPlans.find((item) => item.id === planId);

      try {
        if (dashboardAction === "edit" && plan) {
          loadPlanIntoEditor(plan);
          return;
        }

        if (dashboardAction === "pause" && plan) {
          await togglePausePlan(planId, !plan.isPaused);
          return;
        }

        if (dashboardAction === "delete") {
          if (currentPlan?.id === planId) {
            clearEditor();
          }

          await deletePlan(planId);
        }
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

function readPayload() {
  return {
    brief: document.querySelector("#brief").value,
    budget: document.querySelector("#budget").value,
    location: document.querySelector("#location").value,
    dates: document.querySelector("#dates").value,
    theme: document.querySelector("#theme").value,
    guestCount: document.querySelector("#guestCount").value
  };
}

async function analyzeEvent(payload) {
  return requestJson(
    `${apiBaseUrl}/api/intake`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    "The API could not analyze the event."
  );
}

async function generatePlan(payload) {
  return requestJson(
    `${apiBaseUrl}/api/plans${editingPlanId ? `/${editingPlanId}` : ""}`,
    {
      method: editingPlanId ? "PUT" : "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    "The API could not generate a plan."
  );
}

async function loadDashboardPlans() {
  const payload = await requestJson(`${apiBaseUrl}/api/plans`, {}, "Failed to load events");
  dashboardPlans = Array.isArray(payload.items) ? payload.items : [];
  sortDashboardPlans();
  renderDashboard();
}

async function togglePausePlan(planId, paused) {
  const plan = await requestJson(
    `${apiBaseUrl}/api/plans/${planId}/pause`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ paused })
    },
    "Failed to update pause state"
  );

  upsertDashboardPlan(plan);

  if (currentPlan?.id === plan.id) {
    loadPlanIntoEditor(plan);
  }
}

async function deletePlan(planId) {
  await requestJson(
    `${apiBaseUrl}/api/plans/${planId}`,
    {
      method: "DELETE"
    },
    "Failed to delete event"
  );

  removeDashboardPlan(planId);
}

async function finalizeVendor(vendorId) {
  if (!currentPlan) {
    return;
  }

  if (currentPlan.isPaused) {
    alert("Resume this event before sending confirmation.");
    return;
  }

  currentPlan = await requestJson(
    `${apiBaseUrl}/api/plans/${currentPlan.id}/finalize`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ vendorId })
    },
    "Failed to finalize vendor"
  );

  upsertDashboardPlan(currentPlan);
  renderOutreachStatus(currentPlan);
  renderSelectionStatus(currentPlan);
  renderCommunicationLog(currentPlan);
  renderShortlist(currentPlan);
}

async function sendInquiries() {
  if (!currentPlan) {
    return;
  }

  if (currentPlan.isPaused) {
    alert("Resume this event before sending outreach.");
    return;
  }

  currentPlan = await requestJson(
    `${apiBaseUrl}/api/plans/${currentPlan.id}/send-inquiries`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      }
    },
    "Failed to send inquiry emails"
  );

  upsertDashboardPlan(currentPlan);
  renderShortlist(currentPlan);
  renderOutreachStatus(currentPlan);
  renderCommunicationLog(currentPlan);
}

async function loadSystemStatus() {
  try {
    const payload = await requestJson(`${apiBaseUrl}/health`, {}, "Status request failed");
    renderSystemStatus(payload.integrations);
  } catch {
    renderSystemStatus(null);
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const latestPayload = readPayload();

  try {
    const latestIntake = await analyzeEvent(latestPayload);
    renderIntake(latestIntake);
    results.classList.add("hidden");
  } catch (error) {
    alert(error.message);
  }
});

continueButton.addEventListener("click", async () => {
  const latestPayload = readPayload();

  try {
    currentPlan = await generatePlan(latestPayload);
  } catch (error) {
    alert(error.message);
    return;
  }

  renderPlanSummary(currentPlan);
  renderSuggestions(currentPlan.event.suggestions);
  renderOutreachStatus(currentPlan);
  renderShortlist(currentPlan);
  renderSelectionStatus(currentPlan);
  renderCommunicationLog(currentPlan);
  upsertDashboardPlan(currentPlan);

  const alreadySent = Boolean(currentPlan.communication?.outboundMessages?.some((message) => message.type === "inquiry"));
  sendInquiriesButton.disabled = currentPlan.isPaused || alreadySent;
  sendInquiriesButton.textContent = currentPlan.isPaused ? "Event paused" : alreadySent ? "Outreach already handled" : "Start outreach";
  sendInquiriesButton.classList.remove("hidden");
  results.classList.remove("hidden");
  editingPlanId = currentPlan.id;
  editorState.classList.remove("hidden");
  editorState.textContent = `Editing ${currentPlan.event.type} | ${currentPlan.id}`;
  resetEditorButton.classList.remove("hidden");
});

sendInquiriesButton.addEventListener("click", async () => {
  sendInquiriesButton.disabled = true;
  sendInquiriesButton.textContent = "Sending inquiries...";

  try {
    await sendInquiries();
    sendInquiriesButton.textContent = "Outreach started";
  } catch (error) {
    sendInquiriesButton.disabled = false;
    sendInquiriesButton.textContent = "Start outreach";
    alert(error.message);
  }
});

resetEditorButton.addEventListener("click", () => {
  clearEditor();
});

renderDashboard();
loadDashboardPlans().catch((error) => {
  eventsDashboard.innerHTML = `
    <div class="dashboard-empty">
      <strong>Could not load events.</strong>
      <p>${escapeHtml(error.message)}</p>
    </div>
  `;
});
loadSystemStatus();
