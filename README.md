# AI Event Planner

Minimal split-stack prototype for an autonomous event-planning workflow.

## What it does

- Web app collects a user brief, budget, location, dates, and guest count.
- Web app shows the current deployment stage and whether vendor emails are being rerouted for safe testing.
- Gemini analyzes the event brief, theme, and missing details during intake.
- Gemini can suggest event directions and research vendor/location options when needed.
- API drafts inquiry emails for the top three vendors and exposes them to the web app.
- User reviews the final shortlist and confirms the selected vendor.
- API drafts the final confirmation email for the chosen vendor.
- Plans are persisted to Neon in a JSON-backed `event_plans` table so state survives restarts and deploys.

## Project layout

- `api/` HTTP API and event-planning orchestration logic.
- `web/` static client and lightweight local web server.

## Run locally

1. Start the API:

```bash
npm run dev:api
```

2. In another terminal, start the web app:

```bash
npm run dev:web
```

3. Open `http://localhost:3000`.

## Environment variables

The repo includes both `.env` and `.env.example` with provider-agnostic names so you can swap vendors later.

- `EMAIL_CLIENT_PROVIDER`
- `EMAIL_CLIENT_API_KEY`
- `EMAIL_CLIENT_SENDER_NAME`
- `EMAIL_CLIENT_SENDER_EMAIL`
- `EMAIL_CLIENT_REPLY_TO`
- `EMAIL_CLIENT_INBOUND_DOMAIN`
- `EMAIL_CLIENT_WEBHOOK_SECRET`
- `EMAIL_CLIENT_WEBHOOK_SIGNING_KEY`
- `EMAIL_CLIENT_TEST_MODE`
- `EMAIL_CLIENT_TEST_RECIPIENT`
- `DB_PROVIDER`
- `DB_URL`
- `DB_DIRECT_URL`
- `AI_PROVIDER`
- `AI_API_KEY`
- `AI_MODEL`
- `APP_STAGE`
- `APP_BASE_URL`
- `API_BASE_URL`

Example mapping:

- Mailgun -> `EMAIL_CLIENT_*`
- Neon -> `DB_*`
- Gemini -> `AI_*`

UI notes:

- The intake form includes a `theme` field so the planner can shape recommendations around mood and style.
- The interface intentionally keeps backend implementation details out of the user flow.

Mailgun notes:

- Set `APP_STAGE=testing` to force all outbound vendor email to an app-controlled inbox instead of real vendors
- Set `EMAIL_CLIENT_API_BASE` to `https://api.mailgun.net` or your regional Mailgun API host
- Set `EMAIL_CLIENT_DOMAIN` to your Mailgun sending domain
- Set `EMAIL_CLIENT_SENDER_EMAIL` to your authenticated sender, for example `client@manuswebworks.org`
- Set `EMAIL_CLIENT_INBOUND_DOMAIN` to your inbound subdomain, for example `reply.manuswebworks.org`
- Set `EMAIL_CLIENT_WEBHOOK_SECRET` and configure the Mailgun route to call `/api/webhooks/mailgun/inbound?token=YOUR_SECRET`
- Set `EMAIL_CLIENT_WEBHOOK_SIGNING_KEY` to the Mailgun webhook signing key so inbound requests can be verified
- Set `EMAIL_CLIENT_TEST_MODE=true` if you want inbox rerouting outside the dedicated testing stage
- Set `EMAIL_CLIENT_TEST_RECIPIENT=jhandalex100@gmail.com` or another inbox you control for testing; in `testing` stage this becomes the delivery target for all vendor email
- Set `APP_BASE_URL` to the public base URL of your deployed API, for example `https://api.manuswebworks.org`
- The app generates a per-plan reply-to address like `plan-abc123@reply.manuswebworks.org`

Render notes:

- Deploy the API service with `npm start`
- Deploy the web service with `npm run start:web`
- Set `APP_STAGE=testing` on both services until you are ready for real vendor delivery
- Set `APP_BASE_URL` on the API service to the API's public Render URL or custom domain
- Set `API_BASE_URL` on the web service to that same API URL so the browser talks to the correct backend
- Render injects environment variables directly, so production start commands should not depend on a local `.env` file

Database notes:

- On API startup, the server runs SQL migrations from `api/migrations/`.
- Applied migrations are tracked in a `schema_migrations` table.
- Each plan is stored as a full JSON document in Postgres for a simple first persistence layer.
- `DB_URL` is the primary connection string used by the API.

To create the Mailgun inbound route from `.env`:

```bash
npm run setup:mailgun-route
```

If Mailgun already has an inbound route for the same domain and you want this script to replace it:

```bash
node --env-file=.env scripts/setup-mailgun-route.js --replace-domain
```

## Important limitations

This scaffold still uses:

- Mock vendor catalog data
- Simple vendor scoring and message threading assumptions
- JSON document persistence rather than fully normalized relational tables

To turn this into the full product you described, the next integrations are:

1. Real search and comparison APIs for venues, vendors, maps, pricing, and reviews
2. LLM-based extraction for user requirements and follow-up questions
3. Normalized database tables for plans, vendors, outbound mail, inbound replies, and decisions
4. Human approval controls before every outbound email and final booking action
