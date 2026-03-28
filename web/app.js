const apiBaseUrl = window.AI_EVENT_PLANNER_CONFIG?.apiBaseUrl || "http://localhost:4000";

const form = document.querySelector("#planner-form");
const continueButton = document.querySelector("#continue-button");
const intakeResults = document.querySelector("#intake-results");
const systemStatus = document.querySelector("#system-status");
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

let currentPlan = null;

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
    ${items.map((item) => `<span class="chip">${item}</span>`).join("")}
  `;
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

function renderIntake(intake) {
  intakeResults.classList.remove("hidden");
  assistantMessage.innerHTML = `<p>${intake.assistantMessage}</p>`;
  detectedType.innerHTML = `<span class="chip">Detected event type: ${intake.eventType}</span>`;

  if (intake.suggestions.length > 0) {
    detectedType.innerHTML += intake.suggestions
      .map((item) => `<span class="chip">${item}</span>`)
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
            <strong>${item.field}</strong><br>
            ${item.question}
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
              : `This option could not be contacted yet.`
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
              <strong>${escapeHtml(message.type === "confirmation" ? "Confirmation" : "Inquiry")} · ${escapeHtml(vendorName)}</strong><br>
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
              <strong>Reply · ${escapeHtml(vendorName)}</strong><br>
              ${escapeHtml(message.subject || "No subject")}<br>
              <span class="fine-print">${escapeHtml(formatDate(message.receivedAt))}</span>
              <p>${escapeHtml(message.text || "No message body supplied.")}</p>
            </div>
          `;
        })
        .join("")
    : `<div class="follow-up-item">No vendor replies have been recorded yet.</div>`;
}

async function finalizeVendor(vendorId) {
  if (!currentPlan) {
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/plans/${currentPlan.id}/finalize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ vendorId })
  });

  if (!response.ok) {
    throw new Error("Failed to finalize vendor");
  }

  currentPlan = await response.json();
  renderOutreachStatus(currentPlan);
  renderSelectionStatus(currentPlan);
  renderCommunicationLog(currentPlan);
  renderShortlist(currentPlan);
}

async function sendInquiries() {
  if (!currentPlan) {
    return;
  }

  const response = await fetch(`${apiBaseUrl}/api/plans/${currentPlan.id}/send-inquiries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Failed to send inquiry emails");
  }

  currentPlan = await response.json();
  renderShortlist(currentPlan);
  renderOutreachStatus(currentPlan);
  renderCommunicationLog(currentPlan);
}

function renderShortlist(plan) {
  shortlist.innerHTML = plan.shortlist
    .map(
      (vendor) => `
        <article class="vendor-card">
          <div class="vendor-topline">
            <div>
              <p class="eyebrow">Option ${vendor.rank}</p>
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
          <button type="button" data-vendor-id="${vendor.id}" ${plan.finalSelection?.vendorId === vendor.id ? "disabled" : ""}>${plan.finalSelection?.vendorId === vendor.id ? "Chosen" : "Choose this option"}</button>
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

async function analyzeEvent(payload) {
  const response = await fetch(`${apiBaseUrl}/api/intake`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("The API could not analyze the event.");
  }

  return response.json();
}

async function loadSystemStatus() {
  try {
    const response = await fetch(`${apiBaseUrl}/health`);

    if (!response.ok) {
      throw new Error("Status request failed");
    }

    const payload = await response.json();
    renderSystemStatus(payload.integrations);
  } catch {
    renderSystemStatus(null);
  }
}

async function generatePlan(payload) {
  const response = await fetch(`${apiBaseUrl}/api/plans`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("The API could not generate a plan.");
  }

  return response.json();
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

  summary.innerHTML = `
    <p><strong>Event:</strong> ${currentPlan.event.type}</p>
    <p><strong>Theme:</strong> ${currentPlan.event.theme || "Open"}</p>
    <p><strong>Budget:</strong> ${currentPlan.event.budgetLabel}</p>
    <p><strong>Where:</strong> ${currentPlan.event.location}</p>
    <p><strong>When:</strong> ${currentPlan.event.dateWindow}</p>
    <p><strong>Guests:</strong> ${currentPlan.event.guestCount}</p>
    ${currentPlan.event.plannerSummary ? `<p>${currentPlan.event.plannerSummary}</p>` : ""}
  `;

  renderSuggestions(currentPlan.event.suggestions);
  renderOutreachStatus(currentPlan);
  renderShortlist(currentPlan);
  renderSelectionStatus(currentPlan);
  renderCommunicationLog(currentPlan);
  sendInquiriesButton.disabled = false;
  sendInquiriesButton.textContent = "Start outreach";
  sendInquiriesButton.classList.remove("hidden");
  results.classList.remove("hidden");
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

loadSystemStatus();
