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
- Plans are persisted to Neon in normalized relational tables so state survives restarts and deploys.
- Dashboard events are now loaded from the API, and pause/delete actions persist server-side.

## Project layout

- `api/` HTTP API and event-planning orchestration logic.
- `web/` React client (Vite in development, built static assets in production).

API dashboard endpoints:

- `GET /api/plans`
- `POST /api/plans`
- `PUT /api/plans/:id`
- `PATCH /api/plans/:id/pause`
- `DELETE /api/plans/:id`

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start both services:

```bash
npm run dev
```

3. Open `http://localhost:3000`.

You can still run them separately if needed.

API only:

```bash
npm run dev:api
```

Web only:

```bash
npm run dev:web
```

Production web build:

```bash
npm run build:web
```

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
- `WEB_BASE_URL`
- `API_BASE_URL`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`
- `GOOGLE_OAUTH_REDIRECT_URI`
- `MICROSOFT_OAUTH_CLIENT_ID`
- `MICROSOFT_OAUTH_CLIENT_SECRET`
- `MICROSOFT_OAUTH_REDIRECT_URI`
- `MICROSOFT_OAUTH_TENANT`

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
- Set `APP_BASE_URL` to the API base URL for the current environment
- For local development, use `APP_BASE_URL=http://localhost:4000`
- For Render, use your public Render API URL or custom domain, for example `https://api.manuswebworks.org`
- The app generates a per-user reply-to address with a plan suffix like `johnhand+plan-abc123@reply.manuswebworks.org`
- Important: external providers like Mailgun cannot call back to `localhost`, so inbound webhook setup must use your public Render URL, not a local URL

Calendar notes:

- Set `WEB_BASE_URL` to the public web app URL so calendar OAuth can redirect back to the UI.
- Google OAuth redirect must match `GOOGLE_OAUTH_REDIRECT_URI` (e.g. `http://localhost:4000/api/calendar/callback/google`).
- Microsoft OAuth redirect must match `MICROSOFT_OAUTH_REDIRECT_URI` (e.g. `http://localhost:4000/api/calendar/callback/microsoft`).
- Microsoft tenant defaults to `common` but can be set to a tenant ID if you want to restrict logins.

Render notes:

- Deploy the API service with `npm start`
- Build the React web app with `npm run build:web`
- Deploy the web service with `npm run start:web`
- Set `APP_STAGE=testing` on both services until you are ready for real vendor delivery
- Set `APP_BASE_URL` on the API service to the API's public Render URL or custom domain
- Set `API_BASE_URL` on the web service to that same API URL so the browser talks to the correct backend
- Render injects environment variables directly, so production start commands should not depend on a local `.env` file

Local notes:

- In your local `.env`, set `APP_BASE_URL=http://localhost:4000`
- In your local `.env`, set `API_BASE_URL=http://localhost:4000`
- Keep the Render dashboard values pointed at Render; do not try to use one env var value for both localhost and production

Database notes:

- On API startup, the server runs SQL migrations from `api/migrations/`.
- Applied migrations are tracked in a `schema_migrations` table.
- Plans, shortlisted vendors, inbound replies, and outbound messages are stored in normalized Postgres tables.
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

To turn this into the full product you described, the next integrations are:

1. Real search and comparison APIs for venues, vendors, maps, pricing, and reviews
2. LLM-based extraction for user requirements and follow-up questions
3. Human approval controls before every outbound email and final booking action
