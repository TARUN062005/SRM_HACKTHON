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
- **Route rendering**: white-border + blue-fill polylines (exact Google Maps style); inactive routes in gray
- **Markers**: custom SVG labeled pins (green A = origin, red B = destination)
- **Route intelligence**: collapsible sidebar section with weather waypoints + risk news alerts
- **Simulation**: route animation controls embedded in sidebar (play/stop, speed slider)
- **AI assistant**: Routy chat HUD (bottom-left of map) for voice/text route planning
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
