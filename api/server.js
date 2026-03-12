import http from "node:http";
import { getConfigStatus } from "./src/config/env.js";
import { validateWebhookToken } from "./src/email-client.js";
import { analyzeIntake, createPlan, finalizeVendorSelection, getPlan, recordInboundReply, sendPlanInquiries } from "./src/planner.js";

const PORT = Number(process.env.PORT || 4000);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendNotFound(response) {
  sendJson(response, 404, {
    error: "Not found"
  });
}

async function readJsonBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }

  if (!body) {
    return {};
  }

  return JSON.parse(body);
}

const server = http.createServer(async (request, response) => {
  if (!request.url) {
    return sendNotFound(response);
  }

  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    response.end();
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const path = url.pathname;

  try {
    if (request.method === "GET" && path === "/health") {
      return sendJson(response, 200, {
        ok: true,
        integrations: getConfigStatus()
      });
    }

    if (request.method === "POST" && path === "/api/plans") {
      const payload = await readJsonBody(request);
      const plan = createPlan(payload);
      return sendJson(response, 201, plan);
    }

    if (request.method === "POST" && path === "/api/intake") {
      const payload = await readJsonBody(request);
      const intake = analyzeIntake(payload);
      return sendJson(response, 200, intake);
    }

    if (request.method === "GET" && path.startsWith("/api/plans/")) {
      const planId = path.replace("/api/plans/", "");
      const plan = getPlan(planId);

      if (!plan) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      return sendJson(response, 200, plan);
    }

    if (request.method === "POST" && path.endsWith("/send-inquiries")) {
      const [, , , planId] = path.split("/");
      const result = await sendPlanInquiries(planId);

      if (!result) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      return sendJson(response, 200, result);
    }

    if (request.method === "POST" && path.endsWith("/finalize")) {
      const [, , , planId] = path.split("/");
      const payload = await readJsonBody(request);
      const result = await finalizeVendorSelection(planId, payload.vendorId);

      if (!result) {
        return sendJson(response, 404, { error: "Plan not found" });
      }

      if (result.error) {
        return sendJson(response, 400, result);
      }

      return sendJson(response, 200, result);
    }

    if (request.method === "POST" && path === "/api/webhooks/brevo/inbound") {
      if (!validateWebhookToken(url)) {
        return sendJson(response, 401, { error: "Invalid webhook token" });
      }

      const payload = await readJsonBody(request);
      const result = recordInboundReply(payload);
      return sendJson(response, result.ok ? 200 : 400, result);
    }

    return sendNotFound(response);
  } catch (error) {
    return sendJson(response, 500, {
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

server.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
