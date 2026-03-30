import { appConfig } from "./config/env.js";
import crypto from "node:crypto";
import { isDbConfigured, query } from "./db.js";

const intakeCache = new Map();
const planCache = new Map();
const INTAKE_CACHE_TTL_MS = 5 * 60 * 1000;
const PLAN_CACHE_TTL_MS = 15 * 60 * 1000;

function trim(value) {
  return String(value || "").trim();
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function createCacheKey(prefix, payload) {
  return crypto
    .createHash("sha256")
    .update(`${prefix}:${trim(appConfig.ai.provider).toLowerCase()}:${trim(appConfig.ai.model || "gemini-2.5-flash")}:${stableStringify(payload)}`)
    .digest("hex");
}

function getCachedValue(cache, key) {
  const entry = cache.get(key);

  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function setCachedValue(cache, key, value, ttlMs) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
  return value;
}

async function getPersistentCachedValue(key) {
  if (!isDbConfigured()) {
    return null;
  }

  try {
    const result = await query(
      `
        select response_json
        from ai_response_cache
        where cache_key = $1
          and expires_at > now()
        limit 1
      `,
      [key]
    );

    return result.rows[0]?.response_json || null;
  } catch {
    return null;
  }
}

async function setPersistentCachedValue(key, kind, value, ttlMs) {
  if (!isDbConfigured()) {
    return value;
  }

  try {
    await query(
      `
        insert into ai_response_cache (cache_key, cache_kind, response_json, expires_at, updated_at)
        values ($1, $2, $3::jsonb, now() + ($4 * interval '1 millisecond'), now())
        on conflict (cache_key) do update
        set cache_kind = excluded.cache_kind,
            response_json = excluded.response_json,
            expires_at = excluded.expires_at,
            updated_at = now()
      `,
      [key, kind, JSON.stringify(value), ttlMs]
    );

    await query("delete from ai_response_cache where expires_at <= now()");
  } catch {
    return value;
  }

  return value;
}

function apiUrl() {
  const model = trim(appConfig.ai.model || "gemini-2.5-flash");
  const key = trim(appConfig.ai.apiKey);
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
}

export function isAiConfigured() {
  return Boolean(trim(appConfig.ai.provider).toLowerCase() === "gemini" && trim(appConfig.ai.apiKey));
}

function extractJsonText(payload) {
  const text = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("") || "";

  if (!text) {
    throw new Error("Gemini returned no content");
  }

  return text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
}

async function callGeminiJson({ prompt, useSearch }) {
  const body = {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }]
      }
    ],
    generationConfig: {
      temperature: 0.4
    }
  };

  if (useSearch) {
    body.tools = [{ googleSearch: {} }];
  } else {
    body.generationConfig.responseMimeType = "application/json";
  }

  const response = await fetch(apiUrl(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini request failed with status ${response.status}`);
  }

  return JSON.parse(extractJsonText(payload));
}

export async function generateIntakeWithAi(payload) {
  const cacheKey = createCacheKey("intake", payload);
  const cached = getCachedValue(intakeCache, cacheKey) || await getPersistentCachedValue(cacheKey);

  if (cached) {
    setCachedValue(intakeCache, cacheKey, cached, INTAKE_CACHE_TTL_MS);
    return cached;
  }

  const prompt = `
You are an event planning assistant.
Analyze the user input and return only valid JSON with this shape:
{
  "eventType": "string",
  "readiness": "ready-for-research" | "needs-more-detail",
  "missingFields": ["brief" | "budget" | "location" | "dates"],
  "followUpQuestions": [{"field":"string","question":"string"}],
  "suggestions": ["string"],
  "assistantMessage": "string"
}

Rules:
- Use the provided theme when relevant.
- If the brief is vague, propose 2 to 4 strong event directions.
- Ask for missing budget, location, or dates if they are blank.
- Keep assistantMessage concise, polished, and user-facing.

User input:
${JSON.stringify(payload, null, 2)}
`;

  const result = await callGeminiJson({ prompt, useSearch: false });
  setCachedValue(intakeCache, cacheKey, result, INTAKE_CACHE_TTL_MS);
  return setPersistentCachedValue(cacheKey, "intake", result, INTAKE_CACHE_TTL_MS);
}

export async function generatePlanWithAi(payload) {
  const cacheKey = createCacheKey("plan", payload);
  const cached = getCachedValue(planCache, cacheKey) || await getPersistentCachedValue(cacheKey);

  if (cached) {
    setCachedValue(planCache, cacheKey, cached, PLAN_CACHE_TTL_MS);
    return cached;
  }

  const prompt = `
You are an event planning assistant with web search enabled.
Return only valid JSON with this shape:
{
  "event": {
    "brief": "string",
    "type": "string",
    "theme": "string",
    "budget": number,
    "budgetLabel": "string",
    "location": "string",
    "dateWindow": "string",
    "guestCount": number,
    "suggestions": ["string"],
    "plannerSummary": "string"
  },
  "vendorCategories": [
    {
      "key": "string",
      "label": "string",
      "description": "string"
    }
  ],
  "shortlist": [
    {
      "name": "string",
      "category": "string",
      "rating": number,
      "score": number,
      "estimatedQuote": number,
      "serviceArea": ["string"],
      "summary": "string",
      "status": "available",
      "email": "string"
    }
  ]
}

Rules:
- Search the web for real vendor or location options if needed.
- Use the theme to influence style and vendor fit.
- Prefer options that fit the budget, location, and dates.
- Return 3 to 5 vendor categories when possible.
- For each vendor category, return up to 5 vendor options when possible.
- If exact pricing is unavailable, estimate conservatively.
- Keep summaries brief and user-facing.
- If location is flexible, infer the best likely area from the request and note that in plannerSummary.
- Scores should be from 1 to 100.

User input:
${JSON.stringify(payload, null, 2)}
`;

  const result = await callGeminiJson({ prompt, useSearch: true });
  setCachedValue(planCache, cacheKey, result, PLAN_CACHE_TTL_MS);
  return setPersistentCachedValue(cacheKey, "plan", result, PLAN_CACHE_TTL_MS);
}
