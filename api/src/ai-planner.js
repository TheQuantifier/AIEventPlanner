import { appConfig } from "./config/env.js";

function trim(value) {
  return String(value || "").trim();
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

  return callGeminiJson({ prompt, useSearch: false });
}

export async function generatePlanWithAi(payload) {
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
- Return exactly 3 shortlist items when possible.
- If exact pricing is unavailable, estimate conservatively.
- Keep summaries brief and user-facing.
- If location is flexible, infer the best likely area from the request and note that in plannerSummary.
- Scores should be from 1 to 100.

User input:
${JSON.stringify(payload, null, 2)}
`;

  return callGeminiJson({ prompt, useSearch: true });
}
