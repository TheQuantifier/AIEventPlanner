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

export async function ensurePlanStore() {
  if (!pool) {
    return;
  }
}

export async function savePlan(plan) {
  await query(
    `
      insert into event_plans (id, data, created_at, updated_at)
      values ($1, $2::jsonb, coalesce(($2::jsonb->>'createdAt')::timestamptz, now()), now())
      on conflict (id) do update
      set data = excluded.data,
          updated_at = now()
    `,
    [plan.id, JSON.stringify(plan)]
  );
}

export async function loadPlan(planId) {
  const result = await query("select data from event_plans where id = $1 limit 1", [planId]);
  return result.rows[0]?.data || null;
}

export async function listPlans() {
  const result = await query("select data from event_plans order by created_at desc");
  return result.rows.map((row) => row.data);
}

export async function deletePlan(planId) {
  await query("delete from event_plans where id = $1", [planId]);
}
