import { vendorCatalog } from "./data/vendors.js";
import { buildConfirmationEmail, buildInquiryEmail } from "./email.js";
import { buildPlanReplyAddress, sendEmail } from "./email-client.js";

const plans = new Map();
const requiredFields = ["brief", "budget", "location", "dates"];

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeBrief(value) {
  return String(value || "").trim();
}

function inferEventType(brief) {
  const text = brief.toLowerCase();

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

function generateSuggestions(eventType) {
  const fallback = [
    "Elegant dinner with live music",
    "Modern rooftop networking event",
    "Garden celebration with premium catering"
  ];

  const suggestionsByType = {
    wedding: ["Garden ceremony and reception", "Classic ballroom evening", "Destination-style weekend celebration"],
    birthday: ["Private chef dinner party", "Rooftop cocktail celebration", "Interactive game-night venue"],
    corporate: ["Executive dinner", "Branded launch event", "Offsite workshop with networking hour"],
    fundraiser: ["Mission-focused gala", "Donor brunch", "Auction night with live entertainment"]
  };

  return suggestionsByType[eventType] || fallback;
}

function parseBudget(value) {
  const numeric = Number(String(value || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 10000;
}

function deriveDateWindow(dates) {
  if (Array.isArray(dates) && dates.length > 0) {
    return dates.join(" to ");
  }

  const text = normalizeBrief(dates);
  return text || "Flexible";
}

function deriveLocation(location) {
  return normalizeBrief(location) || "Flexible";
}

function deriveGuestCount(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 100;
}

function vendorMatches(vendor, event) {
  const locationMatch =
    event.location === "Flexible" ||
    vendor.serviceArea.some((area) => area.toLowerCase().includes(event.location.toLowerCase()));

  const eventTypeMatch =
    vendor.eventTypes.includes(event.type) ||
    vendor.eventTypes.includes("corporate") ||
    event.type === "custom-event";

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

function rankVendors(event) {
  return vendorCatalog
    .filter((vendor) => vendorMatches(vendor, event))
    .map((vendor) => {
      const score = scoreVendor(vendor, event);
      return {
        ...vendor,
        score,
        status: "available",
        estimatedQuote: vendor.category === "catering" ? vendor.basePrice * event.guestCount : vendor.basePrice
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);
}

function buildEvent(payload) {
  const brief = normalizeBrief(payload.brief);
  const type = inferEventType(brief);
  const budget = parseBudget(payload.budget);
  const location = deriveLocation(payload.location);
  const dateWindow = deriveDateWindow(payload.dates);
  const guestCount = deriveGuestCount(payload.guestCount);

  return {
    brief,
    type,
    budget,
    budgetLabel: `$${budget.toLocaleString()}`,
    location,
    dateWindow,
    guestCount,
    suggestions: brief.split(/\s+/).filter(Boolean).length < 6 ? generateSuggestions(type) : []
  };
}

function describeField(field) {
  const labels = {
    brief: "what kind of event you want",
    budget: "your budget range",
    location: "the event location",
    dates: "the preferred dates"
  };

  return labels[field];
}

function collectMissingFields(payload) {
  return requiredFields.filter((field) => normalizeBrief(payload[field]).length === 0);
}

function buildFollowUpQuestions(missingFields, eventType) {
  return missingFields.map((field) => {
    const prompts = {
      brief: `What kind of ${eventType === "custom-event" ? "event" : eventType} are you planning?`,
      budget: "What budget range should I plan around?",
      location: "What city or area should I target?",
      dates: "What dates are preferred, or are the dates flexible?"
    };

    return {
      field,
      question: prompts[field]
    };
  });
}

function buildIntakeMessage({ eventType, missingFields, suggestions }) {
  if (missingFields.length === 0) {
    return `I understand this as a ${eventType}. I have enough to start researching vendors and building a shortlist.`;
  }

  const missingSummary = missingFields.map((field) => describeField(field)).join(", ");
  const suggestionText = suggestions.length
    ? ` Possible directions: ${suggestions.join("; ")}.`
    : "";

  return `I think this is a ${eventType}. Before I research vendors, I still need ${missingSummary}.${suggestionText}`;
}

export function analyzeIntake(payload) {
  const brief = normalizeBrief(payload.brief);
  const eventType = inferEventType(brief);
  const suggestions = brief.split(/\s+/).filter(Boolean).length < 6 ? generateSuggestions(eventType) : [];
  const missingFields = collectMissingFields(payload);
  const followUpQuestions = buildFollowUpQuestions(missingFields, eventType);

  return {
    eventType,
    readiness: missingFields.length === 0 ? "ready-for-research" : "needs-more-detail",
    missingFields,
    followUpQuestions,
    suggestions,
    assistantMessage: buildIntakeMessage({
      eventType,
      missingFields,
      suggestions
    })
  };
}

export function createPlan(payload) {
  const event = buildEvent(payload);
  const rankedVendors = rankVendors(event);
  const planId = createId("plan");
  const replyTo = buildPlanReplyAddress(planId);
  const shortlist = rankedVendors.map((vendor, index) => ({
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
    inquiryEmail: buildInquiryEmail({ event, vendor, replyTo })
  }));

  const plan = {
    id: planId,
    createdAt: new Date().toISOString(),
    workflowState: "awaiting-user-selection",
    event,
    communication: {
      replyTo,
      outboundMessages: [],
      inboundMessages: []
    },
    automation: {
      researched: true,
      ratingSystem: {
        ratingWeight: "40%",
        budgetFitWeight: "25%",
        responseSpeedWeight: "15%",
        locationFitWeight: "20%"
      },
      inquiryEmailsDrafted: shortlist.length,
      inquiryEmailsSent: 0,
      vendorRepliesReceived: 0
    },
    shortlist,
    finalSelection: null
  };

  plans.set(plan.id, plan);
  return plan;
}

export function getPlan(planId) {
  return plans.get(planId) || null;
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
  const plan = plans.get(planId);

  if (!plan) {
    return null;
  }

  const outboundMessages = [...plan.communication.outboundMessages];
  const updatedShortlist = [];

  for (const vendor of plan.shortlist) {
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
      delivery
    });

    updatedShortlist.push({
      ...vendor,
      status: delivery.ok ? "inquiry-sent" : vendor.status
    });
  }

  const updatedPlan = {
    ...plan,
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

  plans.set(planId, updatedPlan);
  return updatedPlan;
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

  if (payload.headers && typeof payload.headers === "object") {
    candidates.push(payload.headers["x-envelope-to"]);
    candidates.push(payload.headers["delivered-to"]);
  }

  return candidates.map(extractEmailAddress).find(Boolean) || "";
}

export function recordInboundReply(payload) {
  const planAddress = extractPlanAddress(payload);

  if (!planAddress) {
    return {
      ok: false,
      error: "No recipient address found in inbound payload"
    };
  }

  const [planId] = planAddress.split("@");
  const plan = plans.get(planId);

  if (!plan) {
    return {
      ok: false,
      error: "Plan not found for inbound reply"
    };
  }

  const fromEmail = extractEmailAddress(payload.from || payload.sender?.email || "");
  const vendor = plan.shortlist.find((item) => item.inquiryEmail.to.toLowerCase() === fromEmail.toLowerCase());

  const inboundMessage = {
    id: createId("inbound"),
    receivedAt: new Date().toISOString(),
    from: fromEmail || "unknown",
    subject: String(payload.subject || ""),
    text: String(payload.text || payload["stripped-text"] || payload.html || ""),
    vendorId: vendor?.id || null
  };

  const updatedShortlist = plan.shortlist.map((item) =>
    item.id === vendor?.id
      ? {
          ...item,
          status: "vendor-replied"
        }
      : item
  );

  const updatedPlan = {
    ...plan,
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

  plans.set(plan.id, updatedPlan);

  return {
    ok: true,
    planId: plan.id,
    vendorId: vendor?.id || null
  };
}

export async function finalizeVendorSelection(planId, vendorId) {
  const plan = plans.get(planId);

  if (!plan) {
    return null;
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
          delivery
        }
      ]
    },
    finalSelection: {
      vendorId: selectedVendor.id,
      selectedAt: new Date().toISOString(),
      confirmationEmail,
      delivery
    }
  };

  plans.set(planId, updatedPlan);
  return updatedPlan;
}
