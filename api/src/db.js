import { Pool } from "pg";
import { appConfig } from "./config/env.js";

const connectionString = appConfig.db.url || appConfig.db.directUrl;
const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: {
        rejectUnauthorized: false
      }
    })
  : null;

function numberOrDefault(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function toIsoStringOrFallback(value, fallback = null) {
  if (!value) {
    return fallback;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toISOString();
}

function sortByOrder(left, right) {
  return Number(left.sort_order) - Number(right.sort_order);
}

function mapPlanRow(planRow, suggestions, vendorRows, serviceAreaRows, outboundRows, inboundRows) {
  const vendors = vendorRows
    .map((vendor) => ({
      id: vendor.id,
      rank: Number(vendor.rank) || 0,
      name: vendor.name,
      category: vendor.category,
      rating: numberOrDefault(vendor.rating),
      score: Number(vendor.score) || 0,
      estimatedQuote: numberOrDefault(vendor.estimated_quote),
      summary: vendor.summary || "",
      status: vendor.status || "available",
      email: vendor.email || "",
      intendedEmail: vendor.intended_email || "",
      serviceArea: serviceAreaRows
        .filter((area) => area.vendor_id === vendor.id)
        .sort(sortByOrder)
        .map((area) => area.area)
    }))
    .sort((left, right) => left.rank - right.rank);

  return {
    id: planRow.id,
    createdAt: toIsoStringOrFallback(planRow.created_at, new Date(0).toISOString()),
    updatedAt: toIsoStringOrFallback(planRow.updated_at, new Date(0).toISOString()),
    workflowState: planRow.workflow_state,
    isPaused: Boolean(planRow.is_paused),
    owner: {
      userId: planRow.user_id,
      username: planRow.username
    },
    event: {
      brief: planRow.event_brief || "",
      title: planRow.event_title || "",
      type: planRow.event_type || "",
      theme: planRow.event_theme || "",
      budget: numberOrDefault(planRow.event_budget),
      budgetLabel: planRow.event_budget_label || "",
      location: planRow.event_location || "",
      dateWindow: planRow.event_date_window || "",
      guestCount: Number(planRow.event_guest_count) || 0,
      plannerSummary: planRow.event_planner_summary || "",
      suggestions: suggestions.sort(sortByOrder).map((item) => item.value)
    },
    communication: {
      replyTo: planRow.reply_to || "",
      outboundMessages: outboundRows
        .sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime())
        .map((message) => ({
          id: message.id,
          type: message.type,
          vendorId: message.vendor_id,
          createdAt: toIsoStringOrFallback(message.created_at, new Date(0).toISOString()),
          subject: message.subject || "",
          intendedRecipient: message.intended_recipient || "",
          deliveredTo: message.delivered_to || null,
          delivery: {
            ok: Boolean(message.delivery_ok),
            skipped: Boolean(message.delivery_skipped),
            reason: message.delivery_reason || undefined,
            provider: message.delivery_provider || undefined,
            messageId: message.delivery_message_id || null,
            intendedRecipient: message.intended_recipient || "",
            deliveredTo: message.delivered_to || null,
            deliveryMode: message.delivery_mode || undefined,
            appInbox: message.delivery_app_inbox || null,
            testMode: message.delivery_test_mode,
            stage: message.delivery_stage || undefined,
            ...(message.raw_delivery || {})
          }
        })),
      inboundMessages: inboundRows
        .sort((left, right) => new Date(left.received_at).getTime() - new Date(right.received_at).getTime())
        .map((message) => ({
          id: message.id,
          receivedAt: toIsoStringOrFallback(message.received_at, new Date(0).toISOString()),
          from: message.from_email || "",
          subject: message.subject || "",
          text: message.body_text || "",
          vendorId: message.vendor_id
        }))
    },
    automation: {
      inquiryEmailsDrafted: vendors.length,
      inquiryEmailsSent: outboundRows.filter((message) => message.type === "inquiry" && message.delivery_ok).length,
      vendorRepliesReceived: inboundRows.length
    },
    shortlist: vendors,
    finalSelection: planRow.final_selection_vendor_id
      ? {
          vendorId: planRow.final_selection_vendor_id,
          vendorName: planRow.final_selection_vendor_name || "",
          selectedAt: toIsoStringOrFallback(planRow.final_selection_selected_at, null)
        }
      : null
  };
}

export function isDbConfigured() {
  return Boolean(pool);
}

export function getPool() {
  return pool;
}

export async function query(text, params = []) {
  if (!pool) {
    throw new Error("Database is not configured");
  }

  return pool.query(text, params);
}

async function fetchPlanGraph(client, whereClause, params) {
  const planResult = await client.query(
    `
      select p.*, u.username
      from plans p
      join app_users u on u.id = p.user_id
      where ${whereClause}
      order by p.created_at desc
    `,
    params
  );

  if (planResult.rows.length === 0) {
    return [];
  }

  const planIds = planResult.rows.map((row) => row.id);
  const vendorResult = await client.query("select * from plan_vendors where plan_id = any($1::text[])", [planIds]);
  const vendorIds = vendorResult.rows.map((row) => row.id);
  const serviceAreaResult = vendorIds.length > 0
    ? await client.query("select * from plan_vendor_service_areas where vendor_id = any($1::text[]) order by sort_order asc", [vendorIds])
    : { rows: [] };
  const suggestionResult = await client.query("select * from plan_suggestions where plan_id = any($1::text[]) order by sort_order asc", [planIds]);
  const outboundResult = await client.query("select * from plan_outbound_messages where plan_id = any($1::text[]) order by created_at asc", [planIds]);
  const inboundResult = await client.query("select * from plan_inbound_messages where plan_id = any($1::text[]) order by received_at asc", [planIds]);

  return planResult.rows.map((planRow) =>
    mapPlanRow(
      planRow,
      suggestionResult.rows.filter((row) => row.plan_id === planRow.id),
      vendorResult.rows.filter((row) => row.plan_id === planRow.id),
      serviceAreaResult.rows,
      outboundResult.rows.filter((row) => row.plan_id === planRow.id),
      inboundResult.rows.filter((row) => row.plan_id === planRow.id)
    )
  );
}

export async function savePlan(plan) {
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(
      `
        insert into plans (
          id, user_id, created_at, updated_at, workflow_state, is_paused, reply_to,
          event_brief, event_title, event_type, event_theme, event_budget, event_budget_label,
          event_location, event_date_window, event_guest_count, event_planner_summary,
          final_selection_vendor_id, final_selection_vendor_name, final_selection_selected_at
        )
        values (
          $1, $2, $3::timestamptz, $4::timestamptz, $5, $6, $7,
          $8, $9, $10, $11, $12, $13,
          $14, $15, $16, $17,
          $18, $19, $20::timestamptz
        )
        on conflict (id) do update
        set user_id = excluded.user_id,
            updated_at = excluded.updated_at,
            workflow_state = excluded.workflow_state,
            is_paused = excluded.is_paused,
            reply_to = excluded.reply_to,
            event_brief = excluded.event_brief,
            event_title = excluded.event_title,
            event_type = excluded.event_type,
            event_theme = excluded.event_theme,
            event_budget = excluded.event_budget,
            event_budget_label = excluded.event_budget_label,
            event_location = excluded.event_location,
            event_date_window = excluded.event_date_window,
            event_guest_count = excluded.event_guest_count,
            event_planner_summary = excluded.event_planner_summary,
            final_selection_vendor_id = excluded.final_selection_vendor_id,
            final_selection_vendor_name = excluded.final_selection_vendor_name,
            final_selection_selected_at = excluded.final_selection_selected_at
      `,
      [
        plan.id,
        plan.owner?.userId,
        plan.createdAt || new Date().toISOString(),
        plan.updatedAt || new Date().toISOString(),
        plan.workflowState || "awaiting-user-selection",
        Boolean(plan.isPaused),
        plan.communication?.replyTo || "",
        plan.event?.brief || "",
        plan.event?.title || "",
        plan.event?.type || "",
        plan.event?.theme || "",
        numberOrDefault(plan.event?.budget),
        plan.event?.budgetLabel || "",
        plan.event?.location || "",
        plan.event?.dateWindow || "",
        Number(plan.event?.guestCount) || 0,
        plan.event?.plannerSummary || "",
        plan.finalSelection?.vendorId || null,
        plan.finalSelection?.vendorName || "",
        plan.finalSelection?.selectedAt || null
      ]
    );

    await client.query("delete from plan_suggestions where plan_id = $1", [plan.id]);
    await client.query("delete from plan_outbound_messages where plan_id = $1", [plan.id]);
    await client.query("delete from plan_inbound_messages where plan_id = $1", [plan.id]);
    await client.query("delete from plan_vendors where plan_id = $1", [plan.id]);

    for (const [index, suggestion] of (plan.event?.suggestions || []).entries()) {
      await client.query(
        "insert into plan_suggestions (plan_id, sort_order, value) values ($1, $2, $3)",
        [plan.id, index, suggestion]
      );
    }

    for (const vendor of plan.shortlist || []) {
      await client.query(
        `
          insert into plan_vendors (
            id, plan_id, rank, name, category, rating, score, estimated_quote, summary, status, email, intended_email
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `,
        [
          vendor.id,
          plan.id,
          Number(vendor.rank) || 0,
          vendor.name || "",
          vendor.category || "",
          numberOrDefault(vendor.rating),
          Number(vendor.score) || 0,
          numberOrDefault(vendor.estimatedQuote),
          vendor.summary || "",
          vendor.status || "available",
          vendor.email || "",
          vendor.intendedEmail || ""
        ]
      );

      for (const [index, area] of (vendor.serviceArea || []).entries()) {
        await client.query(
          "insert into plan_vendor_service_areas (vendor_id, sort_order, area) values ($1, $2, $3)",
          [vendor.id, index, area]
        );
      }
    }

    for (const message of plan.communication?.outboundMessages || []) {
      await client.query(
        `
          insert into plan_outbound_messages (
            id, plan_id, vendor_id, type, created_at, subject, intended_recipient, delivered_to,
            delivery_ok, delivery_skipped, delivery_reason, delivery_provider, delivery_message_id,
            delivery_mode, delivery_app_inbox, delivery_test_mode, delivery_stage, raw_delivery
          )
          values (
            $1, $2, $3, $4, $5::timestamptz, $6, $7, $8,
            $9, $10, $11, $12, $13,
            $14, $15, $16, $17, $18::jsonb
          )
        `,
        [
          message.id,
          plan.id,
          message.vendorId || null,
          message.type || "inquiry",
          message.createdAt || new Date().toISOString(),
          message.subject || "",
          message.intendedRecipient || message.delivery?.intendedRecipient || "",
          message.deliveredTo || message.delivery?.deliveredTo || null,
          Boolean(message.delivery?.ok),
          Boolean(message.delivery?.skipped),
          message.delivery?.reason || null,
          message.delivery?.provider || null,
          message.delivery?.messageId || null,
          message.delivery?.deliveryMode || null,
          message.delivery?.appInbox || null,
          typeof message.delivery?.testMode === "boolean" ? message.delivery.testMode : null,
          message.delivery?.stage || null,
          JSON.stringify(message.delivery || {})
        ]
      );
    }

    for (const message of plan.communication?.inboundMessages || []) {
      await client.query(
        `
          insert into plan_inbound_messages (
            id, plan_id, vendor_id, received_at, from_email, subject, body_text
          )
          values ($1, $2, $3, $4::timestamptz, $5, $6, $7)
        `,
        [
          message.id,
          plan.id,
          message.vendorId || null,
          message.receivedAt || new Date().toISOString(),
          message.from || "",
          message.subject || "",
          message.text || ""
        ]
      );
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function loadPlan(planId, userId = null) {
  const client = await pool.connect();

  try {
    const plans = await fetchPlanGraph(
      client,
      userId ? "p.id = $1 and p.user_id = $2" : "p.id = $1",
      userId ? [planId, userId] : [planId]
    );
    return plans[0] || null;
  } finally {
    client.release();
  }
}

export async function listPlans(userId) {
  const client = await pool.connect();

  try {
    return fetchPlanGraph(client, "p.user_id = $1", [userId]);
  } finally {
    client.release();
  }
}

export async function deletePlan(planId, userId) {
  await query("delete from plans where id = $1 and user_id = $2", [planId, userId]);
}
