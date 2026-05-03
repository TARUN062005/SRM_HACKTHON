# Project Overview

This is a fullstack web application with a React frontend and an Express.js backend, built as an all-purpose auth + notification platform.

## Architecture

- **Frontend**: React + Vite (port 5000), located in `client/`
- **Backend**: Express.js + Prisma ORM (port 8000), located in `server/`

## Key Technologies

- **Frontend**: React 19, Vite 7, Tailwind CSS v4, React Router v7, Framer Motion, Leaflet maps, Firebase, Axios
- **Backend**: Express.js, Prisma ORM (PostgreSQL), JWT auth, bcryptjs, nodemailer, twilio, firebase-admin, node-cron, multer
- **Database**: PostgreSQL (Replit's built-in DB via Prisma)

## Setup Notes

### Database
- Originally used MongoDB; migrated schema to PostgreSQL for Replit compatibility
- Prisma schema located at `server/prisma/schema.prisma`
- Uses `cuid()` for IDs (changed from MongoDB's `ObjectId`)
- Migrations stored in `server/prisma/migrations/`

### Workflows
- **Start application** — Starts frontend Vite dev server (`cd client && npm run dev`) on port 5000 (webview)
- **Backend API** — Starts Express backend (`cd server && node index.js`) on port 8000 (console)

### Frontend Proxy
- Vite proxies `/api`, `/uploads`, and `/health` requests to `http://localhost:8000`
- All hosts are allowed for Replit's iframe preview

### Environment Variables
- `NODE_ENV` — Set to `production` (reduces Prisma verbose logging)
- `PORT` — Backend port: `8000`
- `CLIENT_URL` — CORS allowed origin: `http://localhost:5000`
- `DATABASE_URL` — PostgreSQL connection (managed by Replit)

## Features

- User authentication (local, Google, GitHub, Facebook OAuth, magic link)
- JWT-based sessions; auto-verify on register when SMTP not configured
- Admin panel with user management
- Broadcast notification system (in-app, email, push)
- Email templates (EJS)
- Push notification tokens
- Scheduled broadcasts (cron-based)
- Delivery tracking & analytics
- File uploads (multer)
- Rate limiting & security (helmet)
- CORS: all `*.replit.dev` and `*.repl.co` origins are permitted

## Dashboard Map (RouteGuardian)

- **Layout**: Google Maps style — fixed 380px left sidebar + full-width map panel
- **Map tiles**: CartoDB Voyager (closest free alternative to Google Maps look)
- **Route rendering**: white-border + mode-colored polylines; inactive routes colored by risk severity (green=STABLE, amber=CAUTION/HIGH, red=CRITICAL)
- **Markers**: custom SVG labeled pins (green A = origin, red B = destination)
- **Route intelligence**: RiskIntelPanel slides in from right — full dark theme, AI recommendation banner, safer-route switcher
- **Simulation**: route animation controls embedded in sidebar (play/stop, speed slider)
- **AI assistant**: Routy chat HUD (bottom-left of map) for voice/text route planning
- **AI comparison**: POST `/api/ai/routes/compare` — Gemini 1.5 Flash compares all available routes; result shown in Dashboard sidebar and RiskIntelPanel

## Theme System

- **CSS variables**: defined in `client/src/index.css` under `:root` (dark default) and `html.light` (light override)
- **Key tokens**: `--bg`, `--surface`, `--card`, `--border`, `--text-primary`, `--text-secondary`, `--text-muted`, `--accent`, `--accent-glow`, `--danger`, `--success`, `--warning`
- **Theme init**: `client/src/main.jsx` reads `localStorage.theme` and applies classes on `html`; exposes `window.__applyTheme()`
- **Theme toggle**: `client/src/pages/SettingsPage.jsx` calls `applyTheme()` which toggles `html.dark` / `html.light` and updates localStorage
- **Components**: `ShipmentCreationFlow.jsx` and `RiskIntelPanel.jsx` use CSS variables via inline `var(--token)` syntax for full theme compliance

## Key Backend Routes

- `GET /api/ai/directions` — multi-modal route calculation (OSRM + maritime + air great-circle)
- `GET /api/ai/search` — location geocoding
- `POST /api/ai/routes/compare` — Gemini AI route comparison & recommendation (NEW)
- `GET /api/ai/alerts` — global risk zone threat feed
- `GET /api/ai/weather` — Open-Meteo weather at coordinates
- **Layer picker**: top-right map control for Road / Satellite / Dark tiles
- **Locate me**: Leaflet control for GPS-centering

## Live Intelligence System (v5)

- **GLOBAL_RISK_ZONES**: 8 named threat corridors (Red Sea, Hormuz, Black Sea, Gulf of Aden, South China Sea, Eastern Mediterranean, Taiwan Strait, Kerch Strait) in `aiRouteController.js`
- **Route proximity check**: `routePassesNear()` uses Haversine distance to detect which risk zones fall within 700 km of a route corridor
- **Composite risk score**: Zones (60%) + Live news (25%) + Weather (15%) → 0-100 score per route
- **riskZones in intelligence**: Each route's `.intelligence.riskZones` array contains matched zones with `severity`, `reason`, `type`, `newsConfirmed`
- **Map Circle overlays**: Leaflet `Circle` components render each risk zone as a semi-transparent red/orange/amber area on the map
- **Risk score badge**: Floating button (bottom-right of map) shows live score + severity. Color changes: green→amber→red. Opens `RiskIntelPanel` on click
- **RiskIntelPanel**: Slide-in panel from the right of the map with 3 tabs:
  - *Threats*: expandable threat zone cards with WHY explanation text
  - *Intel*: live news articles from NewsData.io with type/date/link
  - *Weather*: hazardous waypoints + all checkpoints with icons
  - *Safer route recommendation*: if a lower-risk alternative exists, shows switch button
- **Live Threat Feed** in Dashboard empty state: Dynamic 5-zone threat feed replacing hardcoded "Active Risk — Red Sea" card
- **getAlerts endpoint** (`GET /api/ai/alerts`): Returns full GLOBAL_RISK_ZONES list as a live threat API

### Key files:
  - `client/src/pages/Dashboard.jsx` — sidebar layout, live threat feed, GLOBAL_THREAT_PREVIEW
  - `client/src/components/RouteMap.jsx` — Circle overlays, risk badge, RiskIntelPanel connection
  - `client/src/components/RiskIntelPanel.jsx` — NEW: explainable risk panel component
  - `server/controller/aiRouteController.js` — GLOBAL_RISK_ZONES, routePassesNear, enhanced getRouteIntelligence, getAlerts

## Routy AI Agent System (v2)

### Architecture
- **`server/controller/aiAgentController.js`** — Dual-mode controller:
  - `agentChat` (POST `/api/ai/agent/chat`) — new multi-turn agentic endpoint. Receives `{ message, state, history }`, returns `{ type, message, state, source?, destination?, options? }`. Types: ASK / CLARIFY / COMPLETE / CHAT
  - `processAIIntent` (POST `/api/ai/intent`) — legacy single-turn kept for backward compat
- **`server/routes/ai.routes.js`** — Added `POST /api/ai/agent/chat` route
- **`client/src/components/RoutyChatPanel.jsx`** — Full agentic chat panel component:
  - Slides in from right edge of map at 360px wide
  - Multi-turn conversation with `{ message, state, history }` sent each turn
  - Conversation state progress bar: shows which fields collected (origin / destination / mode / date / cargo / priority)
  - Mode selection chips when agent asks for transport mode
  - Port/city clarification buttons when agent needs to narrow down location
  - Voice input via Web Speech API with waveform animation + live transcript
  - Thinking dots animation during API call
  - Auto-closes and triggers route generation on `COMPLETE` response
  - Quick suggestion chips for first turn only
  - Reset button clears state and restarts conversation
  - Exports `saveRouteToHistory()` and `loadRouteHistory()` for localStorage-based history
- **`client/src/pages/Dashboard.jsx`** — Major updates:
  - "Ask Routy" button in mode selector header (blue, with pulsing bot icon)
  - "Routy AI" CTA card in empty state
  - `MyRoutesSection` component: collapsible list of up to 8 saved routes with mode icons, severity badges, time-ago timestamps, clear button
  - `handleRoutyRoute` — called when Routy generates COMPLETE: sets selectedSource/Dest, maps agent mode → freightMode
  - `handleRoutySaved` — reloads route history from localStorage
  - `handleLoadSavedRoute` — reloads source/dest/mode from a saved route card click
  - Auto-saves route to history whenever `handleRouteData` fires with a valid route
- **`client/src/components/RouteMap.jsx`** — Removed old `RouteAIHUD` component (~250 lines) and its trigger button; removed `showAIHUD` state; removed `Bot/Mic/MicOff/Send` imports that are no longer needed

### Route History Storage
- Key: `routeguardian_routes` in localStorage
- Each entry: `{ id, origin, destination, mode, date, cargo, riskScore, severity, timestamp, source, dest }`
- Max 20 entries (oldest dropped)
- Saved on: Routy COMPLETE + any manual route fetch via ShipmentCreationFlow

### Conversation State Machine
Fields collected step-by-step: `origin → destination → mode → (date / cargo / priority optional)`
- REQUIRED for route generation: origin, destination, mode
- Gemini parses each user message and extracts mentioned fields, merges with running state
- Backend geocodes both locations on COMPLETE before returning source/destination coords

## Design System (v2 — Dark Control Tower)

Dark-first design language across the entire app shell and all pages.

### Color Tokens
- Background: `#0B1220` (root canvas)
- Surface: `#111827` (sidebar, navbar, panels)
- Card: `#1F2937` (page cards, modals)
- Border: `#374151`
- Primary: `#3B82F6` (blue — CTAs, active nav, highlights)
- Success: `#22C55E` | Warning: `#F59E0B` | Danger: `#EF4444` | Info: `#38BDF8`
- Text Primary: `#F9FAFB` | Secondary: `#9CA3AF` | Muted: `#6B7280`

### App Shell (`DashboardLayout.jsx`)
- Fixed **240px dark sidebar** (always visible): Logo → Nav → bottom Settings/Logout
- Nav items: Dashboard, Routes Map, Risk Alerts (with unread badge), Shipments
- Active nav state: blue highlight + blue dot
- Fixed **64px dark top navbar**: live status dot + page title, New Route button (dashboard only), Bell with dropdown, Profile avatar + dropdown
- Content area: `overflow-hidden` for /dashboard (full-height map), `overflow-y-auto p-6` for all other pages
- Dark mode initialized in `main.jsx` before first render (default: dark, respects localStorage)

### Dashboard (`Dashboard.jsx`)
- Always-visible **380px left control panel** (no collapse/toggle):
  - Dark segmented mode selector (Sea / Air / Rail / Road)
  - Route inputs (ShipmentCreationFlow)
  - Route cards with dark styling, blue active state
  - Simulation controls
  - Route Intelligence collapsible (weather waypoints + risk news)
  - Empty state: KPI cards (colored glow), Live Threat Feed (colored by severity), Getting Started steps
- Map takes `flex-1` remaining width at full height

### NotificationsPage (`NotificationsPage.jsx`)
- Timeline-style list: colored left border by priority, icon in colored circle
- Stats bar: Total / Unread (red) / Read (green)
- Filter bar: type + priority toggles
- Click-to-open detail modal with full message, banner image, CTA

### SettingsPage (`SettingsPage.jsx`)
- Left tab nav: Appearance / Profile / Notifications / Security
- Dark cards with dark inputs (`background: #0B1220`)
- Notifications tab: push toggle + 4 alert category toggles (UI preview)
- Default theme changed to 'dark'

## Project Structure

```
/
├── client/          # React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   └── hookslib/
│   └── vite.config.js
├── server/          # Express.js backend
│   ├── routes/
│   ├── controller/
│   ├── middleware/
│   ├── services/
│   ├── utils/
│   ├── models/      # Mongoose models (legacy, not used by main flow)
│   ├── prisma/
│   │   └── schema.prisma
│   └── index.js
└── replit.md
```

## Deployment

- **Target**: autoscale
- **Build**: `cd client && npm run build && cd ../server && npx prisma generate`
- **Run**: `cd server && node index.js`
- The backend should serve static client build in production (configure `SERVE_ADMIN_CLIENT` or add static serving)
