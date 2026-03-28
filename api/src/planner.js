import { vendorCatalog } from "./data/vendors.js";
import { buildConfirmationEmail, buildInquiryEmail } from "./email.js";
import { buildPlanReplyAddress, isTestModeEnabled, resolveAppInbox, sendEmail } from "./email-client.js";
import { generateIntakeWithAi, generatePlanWithAi, isAiConfigured } from "./ai-planner.js";
import { deletePlan, isDbConfigured, listPlans, loadPlan, savePlan } from "./db.js";

const plans = new Map();
const requiredFields = ["brief", "budget", "location", "dates"];

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeText(value) {
  return String(value || "").trim();
}

async function persistPlan(plan) {
  plans.set(plan.id, plan);

  if (isDbConfigured()) {
    await savePlan(plan);
  }

  return plan;
}

async function getStoredPlan(planId) {
  if (plans.has(planId)) {
    return plans.get(planId);
  }

  if (!isDbConfigured()) {
    return null;
  }

  const plan = await loadPlan(planId);
  if (plan) {
    plans.set(planId, plan);
  }

  return plan;
}

async function listStoredPlans() {
  if (isDbConfigured()) {
    const storedPlans = await listPlans();
    storedPlans.forEach((plan) => {
      plans.set(plan.id, plan);
    });
    return storedPlans;
  }

  return [...plans.values()].sort((left, right) => {
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function inferEventType(brief) {
  const text = normalizeText(brief).toLowerCase();

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

function parseBudget(value) {
  const numeric = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 10000;
}

function deriveDateWindow(dates) {
  const text = normalizeText(dates);
  return text || "Flexible";
}

function deriveLocation(location) {
  return normalizeText(location) || "Flexible";
}

function deriveGuestCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 100;
}

function generateFallbackIdeas(type, theme) {
  const themeText = normalizeText(theme);
  const suffix = themeText ? ` with a ${themeText} feel` : "";
  const ideas = {
    wedding: [`Garden ceremony${suffix}`, `Modern dinner reception${suffix}`, `Weekend destination-style celebration${suffix}`],
    birthday: [`Private dinner party${suffix}`, `Rooftop celebration${suffix}`, `Interactive experience night${suffix}`],
    corporate: [`Executive dinner${suffix}`, `Team offsite${suffix}`, `Brand launch event${suffix}`]
  };

  return ideas[type] || [`Curated celebration${suffix}`, `Modern social gathering${suffix}`, `Destination-inspired event${suffix}`];
}

function collectMissingFields(payload) {
  return requiredFields.filter((field) => normalizeText(payload[field]).length === 0);
}

function buildFallbackIntake(payload) {
  const eventType = inferEventType(payload.brief);
  const missingFields = collectMissingFields(payload);
  const suggestions = normalizeText(payload.brief).split(/\s+/).filter(Boolean).length < 6
    ? generateFallbackIdeas(eventType, payload.theme)
    : [];

  return {
    eventType,
    readiness: missingFields.length === 0 ? "ready-for-research" : "needs-more-detail",
    missingFields,
    followUpQuestions: missingFields.map((field) => ({
      field,
      question:
        {
          budget: "What budget range should I design around?",
          location: "Which city or area should I focus on?",
          dates: "What dates are you considering, or are they flexible?",
          brief: "What kind of event are you planning?"
        }[field] || "Can you share a bit more detail?"
    })),
    suggestions,
    assistantMessage:
      missingFields.length === 0
        ? `I have enough to start shaping options for this ${eventType}.`
        : `I can start guiding this ${eventType}, but I still need a few details before I recommend options.`
  };
}

function vendorMatches(vendor, event) {
  const locationMatch =
    event.location === "Flexible" ||
    vendor.serviceArea.some((area) => area.toLowerCase().includes(event.location.toLowerCase()));

  const eventTypeMatch = vendor.eventTypes.includes(event.type) || event.type === "custom-event";
  const capacityMatch = vendor.capacity >= event.guestCount;
  return locationMatch && eventTypeMatch && capacityMatch;
}

function scoreVendor(vendor, event) {
  const ratingScore = vendor.rating * 20;
  const budgetAlignment = Math.max(0, 30 - Math.abs(event.budget - vendor.basePrice) / 250);
  const speedScore = Math.max(0, 15 - vendor.responseHours);
  const locationScore =
    event.location === "Flexible" ||
    vendor.serviceArea.some((area) => area.toLowerCase() === event.location.toLowerCase())
      ? 15
      : 8;

  return Math.round(ratingScore + budgetAlignment + speedScore + locationScore);
}

function buildFallbackEvent(payload) {
  const brief = normalizeText(payload.brief);
  const type = inferEventType(brief);
  const budget = parseBudget(payload.budget);
  const location = deriveLocation(payload.location);
  const dateWindow = deriveDateWindow(payload.dates);
  const guestCount = deriveGuestCount(payload.guestCount);
  const theme = normalizeText(payload.theme);

  return {
    brief,
    type,
    theme,
    budget,
    budgetLabel: `$${budget.toLocaleString()}`,
    location,
    dateWindow,
    guestCount,
    suggestions: generateFallbackIdeas(type, theme),
    plannerSummary: theme
      ? `A ${theme} direction can guide the venue, catering, and visual tone for this event.`
      : `This plan focuses on practical, budget-aware options that fit the event brief.`
  };
}

function buildFallbackShortlist(event) {
  return vendorCatalog
    .filter((vendor) => vendorMatches(vendor, event))
    .map((vendor) => ({
      ...vendor,
      score: scoreVendor(vendor, event),
      status: "available",
      estimatedQuote: vendor.category === "catering" ? vendor.basePrice * event.guestCount : vendor.basePrice
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function buildShortlistFromCatalog(event, replyTo) {
  const testingInbox = resolveTestingVendorEmail();

  return buildFallbackShortlist(event).map((vendor, index) => ({
    id: vendor.id,
    rank: index + 1,
    name: vendor.name,
    category: vendor.category,
    rating: vendor.rating,
    score: vendor.score,
    estimatedQuote: vendor.estimatedQuote,
    serviceArea: vendor.serviceArea,
    summary: vendor.summary,
    status: vendor.status,
    email: testingInbox || vendor.email,
    intendedEmail: vendor.email,
    inquiryEmail: buildInquiryEmail({
      event,
      vendor: {
        ...vendor,
        email: testingInbox || vendor.email
      },
      replyTo
    })
  }));
}

function resolveTestingVendorEmail() {
  return isTestModeEnabled() ? resolveAppInbox() || "jhandalex100@gmail.com" : "";
}

function coerceEvent(payload, eventData = {}) {
  const budget = Number(eventData.budget);
  const guestCount = Number(eventData.guestCount);

  return {
    brief: normalizeText(eventData.brief || payload.brief),
    type: normalizeText(eventData.type || inferEventType(payload.brief)),
    theme: normalizeText(eventData.theme || payload.theme),
    budget: Number.isFinite(budget) && budget > 0 ? budget : parseBudget(payload.budget),
    budgetLabel: normalizeText(eventData.budgetLabel) || `$${(Number.isFinite(budget) && budget > 0 ? budget : parseBudget(payload.budget)).toLocaleString()}`,
    location: normalizeText(eventData.location || payload.location) || "Flexible",
    dateWindow: normalizeText(eventData.dateWindow || payload.dates) || "Flexible",
    guestCount: Number.isFinite(guestCount) && guestCount > 0 ? guestCount : deriveGuestCount(payload.guestCount),
    suggestions: Array.isArray(eventData.suggestions) ? eventData.suggestions.filter(Boolean) : [],
    plannerSummary: normalizeText(eventData.plannerSummary)
  };
}

function normalizeShortlist(shortlist, event, replyTo) {
  const testingInbox = resolveTestingVendorEmail();

  return shortlist.slice(0, 3).map((vendor, index) => {
    const normalizedVendor = {
      id: createId("vendor"),
      rank: index + 1,
      name: normalizeText(vendor.name) || `Option ${index + 1}`,
      category: normalizeText(vendor.category) || "vendor",
      rating: Number(vendor.rating) || 4.5,
      score: Math.max(1, Math.round(Number(vendor.score) || 78)),
      estimatedQuote: Math.max(500, Math.round(Number(vendor.estimatedQuote) || event.budget / 3)),
      serviceArea: Array.isArray(vendor.serviceArea) ? vendor.serviceArea.filter(Boolean) : [event.location],
      summary: normalizeText(vendor.summary) || "Strong fit for the event brief.",
      status: "available",
      email: testingInbox || normalizeText(vendor.email) || "jhandalex100@gmail.com",
      intendedEmail: normalizeText(vendor.email)
    };

    return {
      ...normalizedVendor,
      inquiryEmail: buildInquiryEmail({
        event,
        vendor: normalizedVendor,
        replyTo
      })
    };
  });
}

export async function analyzeIntake(payload) {
  if (!isAiConfigured()) {
    return buildFallbackIntake(payload);
  }

  try {
    return await generateIntakeWithAi(payload);
  } catch {
    return buildFallbackIntake(payload);
  }
}

async function buildPlanDocument(payload, existingPlan = null) {
  const planId = existingPlan?.id || createId("plan");
  const replyTo = existingPlan?.communication?.replyTo || buildPlanReplyAddress(planId);
  let event;
  let shortlist;

  if (isAiConfigured()) {
    try {
      const aiResult = await generatePlanWithAi(payload);
      event = coerceEvent(payload, aiResult.event);
      shortlist = normalizeShortlist(Array.isArray(aiResult.shortlist) ? aiResult.shortlist : [], event, replyTo);
    } catch {
      event = buildFallbackEvent(payload);
      shortlist = buildShortlistFromCatalog(event, replyTo);
    }
  } else {
    event = buildFallbackEvent(payload);
    shortlist = buildShortlistFromCatalog(event, replyTo);
  }

  if (shortlist.length === 0) {
    if (!event) {
      event = buildFallbackEvent(payload);
    }

    shortlist = buildShortlistFromCatalog(event, replyTo);
  }

  return {
    id: planId,
    createdAt: existingPlan?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowState: "awaiting-user-selection",
    isPaused: Boolean(existingPlan?.isPaused),
    event,
    communication: {
      replyTo,
      outboundMessages: [],
      inboundMessages: []
    },
    automation: {
      inquiryEmailsDrafted: shortlist.length,
      inquiryEmailsSent: 0,
      vendorRepliesReceived: 0
    },
    shortlist,
    finalSelection: null
  };
}

export async function createPlan(payload) {
  const plan = await buildPlanDocument(payload);

  return persistPlan(plan);
}

export async function updatePlan(planId, payload) {
  const existingPlan = await getStoredPlan(planId);

  if (!existingPlan) {
    return null;
  }

  const plan = await buildPlanDocument(payload, existingPlan);
  return persistPlan(plan);
}

export async function listAllPlans() {
  return listStoredPlans();
}

export async function getPlan(planId) {
  return getStoredPlan(planId);
}

async function deliverEmail(message) {
  try {
    return await sendEmail(message);
  } catch (error) {
    return {
      ok: false,
      skipped: false,
      reason: error instanceof Error ? error.message : String(error)
    };
  }
}

export async function sendPlanInquiries(planId) {
  const plan = await getStoredPlan(planId);

  if (!plan) {
    return null;
  }

  if (plan.isPaused) {
    return {
      error: "Plan is paused"
    };
  }

  const outboundMessages = [...plan.communication.outboundMessages];
  const updatedShortlist = [];

  for (const vendor of plan.shortlist) {
    const alreadyContacted = outboundMessages.some((message) => message.type === "inquiry" && message.vendorId === vendor.id);

    if (alreadyContacted) {
      updatedShortlist.push(vendor);
      continue;
    }

    const delivery = await deliverEmail({
      to: vendor.inquiryEmail.to,
      subject: vendor.inquiryEmail.subject,
      text: vendor.inquiryEmail.body,
      replyTo: vendor.inquiryEmail.replyTo,
      tags: ["event-inquiry", plan.id, vendor.id]
    });

    outboundMessages.push({
      id: createId("msg"),
      type: "inquiry",
      vendorId: vendor.id,
      createdAt: new Date().toISOString(),
      subject: vendor.inquiryEmail.subject,
      intendedRecipient: delivery.intendedRecipient || vendor.inquiryEmail.to,
      deliveredTo: delivery.deliveredTo || null,
      delivery
    });

    updatedShortlist.push({
      ...vendor,
      status: delivery.ok ? "contacted" : vendor.status
    });
  }

  const updatedPlan = {
    ...plan,
    updatedAt: new Date().toISOString(),
    workflowState: "vendor-inquiries-sent",
    communication: {
      ...plan.communication,
      outboundMessages
    },
    automation: {
      ...plan.automation,
      inquiryEmailsSent: outboundMessages.filter((message) => message.type === "inquiry" && message.delivery.ok).length
    },
    shortlist: updatedShortlist
  };

  return persistPlan(updatedPlan);
}

function extractEmailAddress(value) {
  return String(value || "").match(/([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)?.[1] || "";
}

function extractPlanAddress(payload) {
  const candidates = [];

  if (Array.isArray(payload.to)) {
    candidates.push(...payload.to);
  } else if (payload.to) {
    candidates.push(payload.to);
  }

  if (payload.recipient) {
    candidates.push(payload.recipient);
  }

  if (payload.Recipient) {
    candidates.push(payload.Recipient);
  }

  if (payload.headers && typeof payload.headers === "object") {
    candidates.push(payload.headers["x-envelope-to"]);
    candidates.push(payload.headers["delivered-to"]);
  }

  return candidates.map(extractEmailAddress).find(Boolean) || "";
}

export async function recordInboundReply(payload) {
  const planAddress = extractPlanAddress(payload);

  if (!planAddress) {
    return {
      ok: false,
      error: "No recipient address found in inbound payload"
    };
  }

  const [planId] = planAddress.split("@");
  const plan = await getStoredPlan(planId);

  if (!plan) {
    return {
      ok: false,
      error: "Plan not found for inbound reply"
    };
  }

  const fromEmail = extractEmailAddress(
    payload.from || payload.sender?.email || payload.sender || payload.From || payload["body-from"] || ""
  );
  const vendor = plan.shortlist.find((item) => item.inquiryEmail.to.toLowerCase() === fromEmail.toLowerCase());

  const inboundMessage = {
    id: createId("inbound"),
    receivedAt: new Date().toISOString(),
    from: fromEmail || "unknown",
    subject: String(payload.subject || payload.Subject || ""),
    text: String(payload["body-plain"] || payload["stripped-text"] || payload.text || payload["stripped-html"] || payload.html || ""),
    vendorId: vendor?.id || null
  };

  const updatedShortlist = plan.shortlist.map((item) =>
    item.id === vendor?.id
      ? {
          ...item,
          status: "replied"
        }
      : item
  );

  const updatedPlan = {
    ...plan,
    updatedAt: new Date().toISOString(),
    communication: {
      ...plan.communication,
      inboundMessages: [...plan.communication.inboundMessages, inboundMessage]
    },
    automation: {
      ...plan.automation,
      vendorRepliesReceived: plan.communication.inboundMessages.length + 1
    },
    shortlist: updatedShortlist
  };

  await persistPlan(updatedPlan);

  return {
    ok: true,
    planId: plan.id,
    vendorId: vendor?.id || null
  };
}

export async function finalizeVendorSelection(planId, vendorId) {
  const plan = await getStoredPlan(planId);

  if (!plan) {
    return null;
  }

  if (plan.isPaused) {
    return {
      error: "Plan is paused"
    };
  }

  const selectedVendor = plan.shortlist.find((vendor) => vendor.id === vendorId);

  if (!selectedVendor) {
    return {
      error: "Selected vendor is not part of the shortlist"
    };
  }

  const confirmationEmail = buildConfirmationEmail({
    event: plan.event,
    vendor: selectedVendor,
    replyTo: plan.communication.replyTo
  });

  const delivery = await deliverEmail({
    to: confirmationEmail.to,
    subject: confirmationEmail.subject,
    text: confirmationEmail.body,
    replyTo: confirmationEmail.replyTo,
    tags: ["event-confirmation", plan.id, selectedVendor.id]
  });

  const updatedPlan = {
    ...plan,
    updatedAt: new Date().toISOString(),
    workflowState: "vendor-confirmed",
    communication: {
      ...plan.communication,
      outboundMessages: [
        ...plan.communication.outboundMessages,
        {
          id: createId("msg"),
          type: "confirmation",
          vendorId: selectedVendor.id,
          createdAt: new Date().toISOString(),
          subject: confirmationEmail.subject,
          intendedRecipient: delivery.intendedRecipient || confirmationEmail.to,
          deliveredTo: delivery.deliveredTo || null,
          delivery
        }
      ]
    },
    finalSelection: {
      vendorId: selectedVendor.id,
      vendorName: selectedVendor.name,
      selectedAt: new Date().toISOString(),
      confirmationEmail,
      delivery
    }
  };

  return persistPlan(updatedPlan);
}

export async function setPlanPaused(planId, paused) {
  const plan = await getStoredPlan(planId);

  if (!plan) {
    return null;
  }

  const updatedPlan = {
    ...plan,
    updatedAt: new Date().toISOString(),
    isPaused: Boolean(paused)
  };

  return persistPlan(updatedPlan);
}

export async function removePlan(planId) {
  const plan = await getStoredPlan(planId);

  if (!plan) {
    return false;
  }

  plans.delete(planId);

  if (isDbConfigured()) {
    await deletePlan(planId);
  }

  return true;
}
