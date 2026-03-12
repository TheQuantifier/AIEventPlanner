const apiBaseUrl = window.AI_EVENT_PLANNER_CONFIG?.apiBaseUrl || "http://localhost:4000";

const form = document.querySelector("#planner-form");
const continueButton = document.querySelector("#continue-button");
const intakeResults = document.querySelector("#intake-results");
const assistantMessage = document.querySelector("#assistant-message");
const detectedType = document.querySelector("#detected-type");
const followUpQuestions = document.querySelector("#follow-up-questions");
const results = document.querySelector("#results");
const summary = document.querySelector("#event-summary");
const suggestions = document.querySelector("#suggestions");
const sendInquiriesButton = document.querySelector("#send-inquiries-button");
const outreachStatus = document.querySelector("#outreach-status");
const shortlist = document.querySelector("#shortlist");
const selectionStatus = document.querySelector("#selection-status");

let currentPlan = null;
let latestPayload = null;
let latestIntake = null;

function currency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
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
    <h2>Vendor confirmed</h2>
    <p>
      The app finalized <strong>${plan.finalSelection.vendorId}</strong> and generated the
      confirmation email below.
    </p>
    <pre class="email-preview">${plan.finalSelection.confirmationEmail.body}</pre>
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
    .map(
      (message) => `
        <div class="follow-up-item">
          <strong>${message.vendorId}</strong><br>
          ${
            message.delivery.ok
              ? `Email sent successfully${message.delivery.messageId ? ` (${message.delivery.messageId})` : ""}.`
              : `Email skipped: ${message.delivery.reason || "not configured"}.`
          }
        </div>
      `
    )
    .join("");
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
}

function renderShortlist(plan) {
  shortlist.innerHTML = plan.shortlist
    .map(
      (vendor) => `
        <article class="vendor-card">
          <div class="vendor-topline">
            <div>
              <p class="eyebrow">Rank ${vendor.rank}</p>
              <h3>${vendor.name}</h3>
            </div>
            <strong>${currency(vendor.estimatedQuote)}</strong>
          </div>
          <div class="vendor-meta">
            <span>${vendor.category}</span>
            <span>Rating ${vendor.rating}/5</span>
            <span>Score ${vendor.score}</span>
            <span>Status: ${vendor.status}</span>
          </div>
          <p>${vendor.summary}</p>
          <pre class="email-preview">${vendor.inquiryEmail.body}</pre>
          <button type="button" data-vendor-id="${vendor.id}">Select this vendor</button>
        </article>
      `
    )
    .join("");

  shortlist.querySelectorAll("button[data-vendor-id]").forEach((button) => {
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Finalizing...";

      try {
        await finalizeVendor(button.dataset.vendorId);
        button.textContent = "Selected";
      } catch (error) {
        button.disabled = false;
        button.textContent = "Select this vendor";
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

  latestPayload = readPayload();

  try {
    latestIntake = await analyzeEvent(latestPayload);
    renderIntake(latestIntake);
    results.classList.add("hidden");
  } catch (error) {
    alert(error.message);
  }
});

continueButton.addEventListener("click", async () => {
  latestPayload = readPayload();

  try {
    currentPlan = await generatePlan(latestPayload);
  } catch (error) {
    alert(error.message);
    return;
  }

  summary.innerHTML = `
    <p><strong>Type:</strong> ${currentPlan.event.type}</p>
    <p><strong>Budget:</strong> ${currentPlan.event.budgetLabel}</p>
    <p><strong>Location:</strong> ${currentPlan.event.location}</p>
    <p><strong>Dates:</strong> ${currentPlan.event.dateWindow}</p>
    <p><strong>Guest count:</strong> ${currentPlan.event.guestCount}</p>
    <p><strong>Automation:</strong> ${currentPlan.automation.inquiryEmailsDrafted} inquiry drafts prepared. ${currentPlan.automation.inquiryEmailsSent} have been sent through the email client.</p>
  `;

  renderSuggestions(currentPlan.event.suggestions);
  renderOutreachStatus(currentPlan);
  renderShortlist(currentPlan);
  renderSelectionStatus(currentPlan);
  sendInquiriesButton.classList.remove("hidden");
  results.classList.remove("hidden");
});

sendInquiriesButton.addEventListener("click", async () => {
  sendInquiriesButton.disabled = true;
  sendInquiriesButton.textContent = "Sending inquiries...";

  try {
    await sendInquiries();
    sendInquiriesButton.textContent = "Inquiry emails sent";
  } catch (error) {
    sendInquiriesButton.disabled = false;
    sendInquiriesButton.textContent = "Send inquiry emails";
    alert(error.message);
  }
});
