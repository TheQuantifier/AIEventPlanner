import { vendorCatalog } from "./data/vendors.js";
import { buildConfirmationEmail, buildInquiryEmail } from "./email.js";
import { buildPlanReplyAddress, buildUserReplyAddress, buildUserSenderAddress, isTestModeEnabled, resolveAppInbox, sendEmail } from "./email-client.js";
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

function normalizeEmail(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeCategoryKey(value) {
  return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function buildOwnerSummary(user) {
  return user
    ? {
        userId: user.id,
        username: user.username
      }
    : {
        userId: null,
        username: ""
      };
}

function toTitleCase(value) {
  return normalizeText(value)
    .split(/[\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatEventTypeLabel(type) {
  const labels = {
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

  return labels[normalizeText(type).toLowerCase()] || toTitleCase(type || "Event");
}

function shortenTheme(theme) {
  return normalizeText(theme)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function generateEventTitle({ type, theme, location }) {
  const parts = [];
  const locationPart = normalizeText(location) && normalizeText(location) !== "Flexible" ? toTitleCase(location) : "";
  const themePart = shortenTheme(theme);
  const typePart = formatEventTypeLabel(type);

  if (locationPart) {
    parts.push(locationPart);
  }

  if (themePart) {
    parts.push(themePart);
  }

  parts.push(typePart);

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

async function persistPlan(plan) {
  const normalizedPlan = refreshPlanDrafts(plan);
  plans.set(normalizedPlan.id, normalizedPlan);

  if (isDbConfigured()) {
    await savePlan(normalizedPlan);
  }

  return normalizedPlan;
}

async function getStoredPlan(planId, userId = null) {
  if (plans.has(planId)) {
    const cachedPlan = refreshPlanDrafts(plans.get(planId));
    if (!userId || cachedPlan?.owner?.userId === userId) {
      plans.set(planId, cachedPlan);
      return cachedPlan;
    }
  }

  if (!isDbConfigured()) {
    return null;
  }

  const plan = await loadPlan(planId, userId);
  if (plan) {
    const normalizedPlan = refreshPlanDrafts(plan);
    plans.set(planId, normalizedPlan);
    return normalizedPlan;
  }

  return plan;
}

async function listStoredPlans(userId) {
  if (isDbConfigured()) {
    const storedPlans = (await listPlans(userId)).map((plan) => refreshPlanDrafts(plan));
    storedPlans.forEach((plan) => {
      plans.set(plan.id, plan);
    });
    return storedPlans;
  }

  return [...plans.values()].filter((plan) => plan?.owner?.userId === userId).map((plan) => refreshPlanDrafts(plan)).sort((left, right) => {
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function refreshPlanDrafts(plan) {
  if (!plan?.event || !Array.isArray(plan.shortlist)) {
    return plan;
  }

  const replyTo = plan.communication?.replyTo || "";

  return {
    ...plan,
    shortlist: plan.shortlist.map((vendor) => ({
      ...vendor,
      inquiryEmail: buildInquiryEmail({
        event: plan.event,
        vendor,
        replyTo
      })
    })),
    finalSelection: plan.finalSelection
      ? {
          ...plan.finalSelection,
          confirmationEmail: buildConfirmationEmail({
            event: plan.event,
            vendor: {
              name: plan.finalSelection.vendorName,
              email: plan.finalSelection.confirmationEmail?.to || ""
            },
            replyTo
          })
        }
      : plan.finalSelection
  };
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

function formatBudgetLabel(value) {
  const numeric = Number(value);
  const resolved = Number.isFinite(numeric) && numeric > 0 ? numeric : parseBudget(value);
  return `$${resolved.toLocaleString()}`;
}

function normalizeBudgetLabel(label, budget) {
  const normalizedLabel = normalizeText(label);

  if (!normalizedLabel) {
    return formatBudgetLabel(budget);
  }

  const parsedFromLabel = Number(normalizedLabel.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(parsedFromLabel) && parsedFromLabel > 0) {
    return formatBudgetLabel(parsedFromLabel);
  }

  return formatBudgetLabel(budget);
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

function defaultVendorCategoriesForEvent(event) {
  const categories = ["venue", "planner", "catering"];

  if (event.guestCount >= 60) {
    categories.push("photography");
  }

  if (["birthday", "baby-shower", "graduation", "custom-event"].includes(event.type)) {
    categories.push("activity");
  }

  if (normalizeText(event.theme)) {
    categories.push("decor");
  }

  return [...new Set(categories)];
}

function humanizeCategoryLabel(categoryKey) {
  return normalizeCategoryKey(categoryKey)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
    title: generateEventTitle({ type, theme, location }),
    type,
    theme,
    budget,
    budgetLabel: formatBudgetLabel(budget),
    location,
    dateWindow,
    guestCount,
    suggestions: generateFallbackIdeas(type, theme),
    plannerSummary: theme
      ? `A ${theme} direction can guide the venue, catering, and visual tone for this event.`
      : `This plan focuses on practical, budget-aware options that fit the event brief.`
  };
}

function buildFallbackVendorCategories(event) {
  return defaultVendorCategoriesForEvent(event).map((categoryKey) => ({
    key: categoryKey,
    label: humanizeCategoryLabel(categoryKey),
    description: `Recommended ${humanizeCategoryLabel(categoryKey).toLowerCase()} support for this event.`,
    selected: true
  }));
}

function buildFallbackShortlist(event, vendorCategories) {
  return vendorCategories.flatMap((vendorCategory) => {
    const strictMatches = vendorCatalog.filter((vendor) => vendor.category === vendorCategory.key && vendorMatches(vendor, event));
    const relaxedMatches =
      strictMatches.length > 0
        ? strictMatches
        : vendorCatalog.filter((vendor) => {
            const eventTypeMatch = vendor.eventTypes.includes(event.type) || event.type === "custom-event";
            const capacityMatch = vendor.capacity >= event.guestCount;
            return vendor.category === vendorCategory.key && eventTypeMatch && capacityMatch;
          });

    return relaxedMatches
      .map((vendor) => ({
        ...vendor,
        score: scoreVendor(vendor, event),
        status: "available",
        estimatedQuote: vendor.category === "catering" ? vendor.basePrice * event.guestCount : vendor.basePrice
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, 5);
  });
}

function buildShortlistFromCatalog(event, vendorCategories, replyTo) {
  const testingInbox = resolveTestingVendorEmail();

  return buildFallbackShortlist(event, vendorCategories).map((vendor, index) => ({
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
  const guestCount = Number(eventData.guestCount);
  const resolvedBudget = parseBudget(payload.budget);

  return {
    brief: normalizeText(eventData.brief || payload.brief),
    title: normalizeText(eventData.title) || generateEventTitle({
      type: eventData.type || inferEventType(payload.brief),
      theme: eventData.theme || payload.theme,
      location: eventData.location || payload.location
    }),
    type: normalizeText(eventData.type || inferEventType(payload.brief)),
    theme: normalizeText(eventData.theme || payload.theme),
    budget: resolvedBudget,
    budgetLabel: formatBudgetLabel(payload.budget),
    location: normalizeText(eventData.location || payload.location) || "Flexible",
    dateWindow: normalizeText(eventData.dateWindow || payload.dates) || "Flexible",
    guestCount: Number.isFinite(guestCount) && guestCount > 0 ? guestCount : deriveGuestCount(payload.guestCount),
    suggestions: Array.isArray(eventData.suggestions) ? eventData.suggestions.filter(Boolean) : [],
    plannerSummary: normalizeText(eventData.plannerSummary)
  };
}

function normalizeVendorCategories(vendorCategories, shortlist, selectedCategoryKeys = []) {
  const selectedSet = new Set(selectedCategoryKeys.map(normalizeCategoryKey));
  const inputCategories = Array.isArray(vendorCategories) ? vendorCategories : [];
  const derivedCategories = Array.from(
    new Set(
      shortlist
        .map((vendor) => normalizeCategoryKey(vendor.category))
        .filter(Boolean)
    )
  );
  const combined = [
    ...inputCategories.map((category) => ({
      key: normalizeCategoryKey(category.key || category.label),
      label: normalizeText(category.label) || humanizeCategoryLabel(category.key || category.label),
      description: normalizeText(category.description),
      selected: selectedSet.size > 0 ? selectedSet.has(normalizeCategoryKey(category.key || category.label)) : true
    })),
    ...derivedCategories
      .filter((categoryKey) => !inputCategories.some((item) => normalizeCategoryKey(item.key || item.label) === categoryKey))
      .map((categoryKey) => ({
        key: categoryKey,
        label: humanizeCategoryLabel(categoryKey),
        description: `Recommended ${humanizeCategoryLabel(categoryKey).toLowerCase()} support for this event.`,
        selected: selectedSet.size > 0 ? selectedSet.has(categoryKey) : true
      }))
  ].filter((category) => category.key);

  return combined.length > 0 ? combined : derivedCategories.map((categoryKey) => ({
    key: categoryKey,
    label: humanizeCategoryLabel(categoryKey),
    description: `Recommended ${humanizeCategoryLabel(categoryKey).toLowerCase()} support for this event.`,
    selected: true
  }));
}

function normalizeShortlist(shortlist, event, vendorCategories, replyTo) {
  const testingInbox = resolveTestingVendorEmail();
  const allowedCategoryKeys = new Set(vendorCategories.map((category) => category.key));
  const countsByCategory = new Map();

  return shortlist
    .filter((vendor) => allowedCategoryKeys.size === 0 || allowedCategoryKeys.has(normalizeCategoryKey(vendor.category)))
    .filter((vendor) => {
      const categoryKey = normalizeCategoryKey(vendor.category);
      const currentCount = countsByCategory.get(categoryKey) || 0;
      if (currentCount >= 5) {
        return false;
      }
      countsByCategory.set(categoryKey, currentCount + 1);
      return true;
    })
    .map((vendor, index) => {
    const normalizedVendor = {
      id: createId("vendor"),
      rank: index + 1,
      name: normalizeText(vendor.name) || `Option ${index + 1}`,
      category: normalizeCategoryKey(vendor.category) || "vendor",
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

function preserveShortlistState(shortlist, existingShortlist = []) {
  const existingByEmail = new Map();

  existingShortlist.forEach((vendor) => {
    const keys = [
      normalizeEmail(vendor.intendedEmail),
      normalizeEmail(vendor.email),
      normalizeEmail(vendor.inquiryEmail?.to)
    ].filter(Boolean);

    keys.forEach((key) => {
      if (!existingByEmail.has(key)) {
        existingByEmail.set(key, vendor);
      }
    });
  });

  return shortlist.map((vendor) => {
    const preserved = [
      normalizeEmail(vendor.intendedEmail),
      normalizeEmail(vendor.email),
      normalizeEmail(vendor.inquiryEmail?.to)
    ]
      .filter(Boolean)
      .map((key) => existingByEmail.get(key))
      .find(Boolean);

    if (!preserved) {
      return vendor;
    }

    return {
      ...vendor,
      id: preserved.id || vendor.id,
      status: preserved.status || vendor.status
    };
  });
}

function parseHeaderEntries(payload) {
  const rawHeaders = payload["message-headers"] || payload["Message-Headers"] || payload.headers;

  if (Array.isArray(rawHeaders)) {
    return rawHeaders;
  }

  if (typeof rawHeaders === "string") {
    try {
      const parsed = JSON.parse(rawHeaders);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
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

async function buildPlanDocument(payload, user, existingPlan = null) {
  const planId = existingPlan?.id || createId("plan");
  const replyTo = existingPlan?.communication?.replyTo || buildUserReplyAddress({ username: user?.username, planId }) || buildPlanReplyAddress(planId);
  const existingCommunication = existingPlan?.communication;
  let event;
  let vendorCategories;
  let shortlist;
  const selectedCategoryKeys = Array.isArray(payload.selectedVendorCategories)
    ? payload.selectedVendorCategories
    : (existingPlan?.vendorCategories || []).filter((item) => item.selected).map((item) => item.key);

  if (isAiConfigured()) {
    try {
      const aiResult = await generatePlanWithAi(payload);
      event = coerceEvent(payload, aiResult.event);
      vendorCategories = normalizeVendorCategories(aiResult.vendorCategories, Array.isArray(aiResult.shortlist) ? aiResult.shortlist : [], selectedCategoryKeys);
      shortlist = normalizeShortlist(Array.isArray(aiResult.shortlist) ? aiResult.shortlist : [], event, vendorCategories, replyTo);
    } catch {
      event = buildFallbackEvent(payload);
      vendorCategories = normalizeVendorCategories(buildFallbackVendorCategories(event), buildFallbackShortlist(event, buildFallbackVendorCategories(event)), selectedCategoryKeys);
      shortlist = buildShortlistFromCatalog(event, vendorCategories, replyTo);
    }
  } else {
    event = buildFallbackEvent(payload);
    vendorCategories = normalizeVendorCategories(buildFallbackVendorCategories(event), buildFallbackShortlist(event, buildFallbackVendorCategories(event)), selectedCategoryKeys);
    shortlist = buildShortlistFromCatalog(event, vendorCategories, replyTo);
  }

  if (shortlist.length === 0) {
    if (!event) {
      event = buildFallbackEvent(payload);
    }

    vendorCategories = vendorCategories || normalizeVendorCategories(buildFallbackVendorCategories(event), buildFallbackShortlist(event, buildFallbackVendorCategories(event)), selectedCategoryKeys);
    shortlist = buildShortlistFromCatalog(event, vendorCategories, replyTo);
  }

  const communication = {
    replyTo,
    outboundMessages: Array.isArray(existingCommunication?.outboundMessages) ? existingCommunication.outboundMessages : [],
    inboundMessages: Array.isArray(existingCommunication?.inboundMessages) ? existingCommunication.inboundMessages : []
  };
  const preservedShortlist = preserveShortlistState(shortlist, existingPlan?.shortlist || []);
  const inquiryEmailsSent = communication.outboundMessages.filter((message) => message.type === "inquiry" && message.delivery?.ok).length;
  const vendorRepliesReceived = communication.inboundMessages.length;

  return {
    id: planId,
    createdAt: existingPlan?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflowState: existingPlan?.workflowState || "awaiting-user-selection",
    isPaused: Boolean(existingPlan?.isPaused),
    owner: buildOwnerSummary(user),
    event,
    vendorCategories,
    communication,
    automation: {
      inquiryEmailsDrafted: preservedShortlist.filter((vendor) =>
        vendorCategories.some((category) => category.selected && category.key === normalizeCategoryKey(vendor.category))
      ).length,
      inquiryEmailsSent,
      vendorRepliesReceived
    },
    shortlist: preservedShortlist,
    finalSelection: existingPlan?.finalSelection || null
  };
}

function sameSelectedCategories(payload, existingPlan) {
  const nextSelected = (Array.isArray(payload.selectedVendorCategories)
    ? payload.selectedVendorCategories
    : (existingPlan?.vendorCategories || []).filter((item) => item.selected).map((item) => item.key))
    .map(normalizeCategoryKey)
    .sort()
    .join("|");
  const existingSelected = (existingPlan?.vendorCategories || [])
    .filter((item) => item.selected)
    .map((item) => normalizeCategoryKey(item.key))
    .sort()
    .join("|");

  return nextSelected === existingSelected;
}

function sameNormalizedValue(left, right) {
  return normalizeText(left).toLowerCase() === normalizeText(right).toLowerCase();
}

function isEquivalentEventInput(payload, existingPlan) {
  if (!existingPlan?.event) {
    return false;
  }

  const existingBudget = Number(existingPlan.event.budget) || parseBudget(existingPlan.event.budgetLabel);
  const nextBudget = parseBudget(payload.budget);
  const existingGuestCount = Number(existingPlan.event.guestCount) || 0;
  const nextGuestCount = deriveGuestCount(payload.guestCount);

  return (
    sameNormalizedValue(payload.brief, existingPlan.event.brief) &&
    sameNormalizedValue(payload.location, existingPlan.event.location) &&
    sameNormalizedValue(payload.dates, existingPlan.event.dateWindow) &&
    sameNormalizedValue(payload.theme, existingPlan.event.theme) &&
    nextBudget === existingBudget &&
    nextGuestCount === existingGuestCount
  );
}

export async function createPlan(payload, user) {
  const plan = await buildPlanDocument(payload, user);

  return persistPlan(plan);
}

export async function updatePlan(planId, payload, user) {
  const existingPlan = await getStoredPlan(planId, user.id);

  if (!existingPlan) {
    return null;
  }

  if (isEquivalentEventInput(payload, existingPlan) && sameSelectedCategories(payload, existingPlan)) {
    return refreshPlanDrafts(existingPlan);
  }

  const plan = await buildPlanDocument(payload, user, existingPlan);
  return persistPlan(plan);
}

export async function listAllPlans(userId) {
  return listStoredPlans(userId);
}

export async function getPlan(planId, userId) {
  return getStoredPlan(planId, userId);
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

export async function sendPlanInquiries(planId, userId) {
  const plan = await getStoredPlan(planId, userId);

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
  const selectedCategoryKeys = new Set((plan.vendorCategories || []).filter((category) => category.selected).map((category) => category.key));
  const hasCategoryConfig = Array.isArray(plan.vendorCategories) && plan.vendorCategories.length > 0;

  for (const vendor of plan.shortlist) {
    if (hasCategoryConfig && !selectedCategoryKeys.has(normalizeCategoryKey(vendor.category))) {
      updatedShortlist.push(vendor);
      continue;
    }

    const alreadyContacted = outboundMessages.some((message) => message.type === "inquiry" && message.vendorId === vendor.id);

    if (alreadyContacted) {
      updatedShortlist.push(vendor);
      continue;
    }

    const delivery = await deliverEmail({
      to: vendor.inquiryEmail.to,
      subject: vendor.inquiryEmail.subject,
      text: vendor.inquiryEmail.text || vendor.inquiryEmail.body,
      html: vendor.inquiryEmail.html,
      replyTo: vendor.inquiryEmail.replyTo,
      fromName: plan.owner?.username || "AI Event Planner",
      fromEmail: buildUserSenderAddress(plan.owner?.username),
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

function trimQuotedReplyText(value) {
  const text = String(value || "").replace(/\r\n/g, "\n").trim();

  if (!text) {
    return "";
  }

  const quoteStartPatterns = [
    /^\s*On .+wrote:\s*$/im,
    /^\s*From:\s.+$/im,
    /^\s*Sent:\s.+$/im,
    /^\s*Subject:\s.+$/im,
    /^\s*-{2,}\s*Original Message\s*-{2,}\s*$/im,
    /^\s*_{2,}\s*$/im
  ];

  let endIndex = text.length;
  for (const pattern of quoteStartPatterns) {
    const match = pattern.exec(text);
    if (match && typeof match.index === "number") {
      endIndex = Math.min(endIndex, match.index);
    }
  }

  const beforeQuotedBlock = text.slice(0, endIndex);
  const cleanedLines = beforeQuotedBlock
    .split("\n")
    .filter((line) => !line.trimStart().startsWith(">"));

  return cleanedLines.join("\n").trim();
}

function extractInboundReplyText(payload) {
  const preferred = [
    payload["stripped-text"],
    payload["body-plain"],
    payload.text,
    payload["stripped-html"],
    payload.html
  ];

  for (const candidate of preferred) {
    const trimmed = trimQuotedReplyText(candidate);
    if (trimmed) {
      return trimmed;
    }
  }

  return "";
}

function extractPlanAddress(payload) {
  const candidates = [];
  const headerEntries = parseHeaderEntries(payload);

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

  headerEntries.forEach((entry) => {
    if (!Array.isArray(entry) || entry.length < 2) {
      return;
    }

    const [name, value] = entry;
    const normalizedName = normalizeText(name).toLowerCase();

    if (["to", "delivered-to", "x-envelope-to", "x-original-to", "envelope-to"].includes(normalizedName)) {
      candidates.push(value);
    }
  });

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

  const localPart = planAddress.split("@")[0] || "";
  const planId = localPart.includes("+") ? localPart.split("+").pop() : localPart;
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
  const vendor = plan.shortlist.find((item) =>
    [item.intendedEmail, item.email, item.inquiryEmail?.to].some((candidate) => normalizeEmail(candidate) === normalizeEmail(fromEmail))
  );

  const inboundMessage = {
    id: createId("inbound"),
    receivedAt: new Date().toISOString(),
    from: fromEmail || "unknown",
    subject: String(payload.subject || payload.Subject || ""),
    text: extractInboundReplyText(payload),
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

export async function finalizeVendorSelection(planId, vendorId, userId) {
  const plan = await getStoredPlan(planId, userId);

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
    text: confirmationEmail.text || confirmationEmail.body,
    html: confirmationEmail.html,
    replyTo: confirmationEmail.replyTo,
    fromName: plan.owner?.username || "AI Event Planner",
    fromEmail: buildUserSenderAddress(plan.owner?.username),
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

export async function setPlanPaused(planId, paused, userId) {
  const plan = await getStoredPlan(planId, userId);

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

export async function removePlan(planId, userId) {
  const plan = await getStoredPlan(planId, userId);

  if (!plan) {
    return false;
  }

  plans.delete(planId);

  if (isDbConfigured()) {
    await deletePlan(planId, userId);
  }

  return true;
}
