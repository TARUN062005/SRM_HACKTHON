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
- JWT-based sessions
- Admin panel with user management
- Broadcast notification system (in-app, email, push)
- Email templates (EJS)
- Push notification tokens
- Scheduled broadcasts (cron-based)
- Delivery tracking & analytics
- File uploads (multer)
- Rate limiting & security (helmet)

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
