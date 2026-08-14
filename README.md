# Lawn Craft - Professional Lawn Care Platform

A modern lawn care website with a clean Express.js backend that sends contact form submissions directly to Supabase.

## Project Structure

```text
friendly-telegram/
├── *.html, *.js, *.css # Static site files at repository root
├── assets/             # Images and static assets
├── node-backend/      # Express + Supabase backend
└── README.md
```

## Frontend

The website pages and static resources are in the repository root (for example `index.html`, `services.html`, `script.js`, and `styles.css`) with shared files under `assets/`.

## Backend

The backend lives in `node-backend/` and exposes:

- `GET /health`
- `POST /api/contact`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`

It uses Express, CORS, dotenv, and the Supabase JS client.

## Local Setup

Start the frontend with a static file server and the backend with Node:

```bash
cd /home/runner/work/friendly-telegram/friendly-telegram
python3 -m http.server 8080
```

```bash
cd node-backend
npm install
npm run dev
```

## Environment

Create `node-backend/.env` from `node-backend/.env.example` and set:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PORT`
- `CORS_ORIGIN`

## Contact Flow

The frontend contact form submits to `POST /api/contact`. When running locally, the script defaults to `http://127.0.0.1:3001/api/contact`.

## Notes

The old Python backend has been removed from this repository to avoid collisions with the new Node.js implementation.

## Detailed Project Walkthrough

This repository is split into two runtime parts:

1. **Static frontend (repository root)**  
   The public website is served from HTML/CSS/JS files in the project root (`index.html`, `about.html`, `services.html`, etc.) with shared assets under `assets/`.

2. **Node backend (`node-backend/`)**  
   An Express API handles lead capture and authentication using Supabase services.

### Frontend details

- **Page routing:** Production routing is handled by platform rewrites (`vercel.json`) so clean URLs like `/services` map to `services.html`.
- **Client logic:**  
  - `script.js` contains main UI behavior and contact-form submission logic.  
  - `auth.js` handles login/signup session flows for auth pages.
- **PWA support:** `sw.js`, `manifest.json`, and `offline.html` provide install/offline behavior.
- **Frontend smoke test:** `test-pwa.js` verifies key clean URLs and PWA files locally.

### Backend details

`node-backend/server.js` sets up middleware, CORS, JSON parsing, route mounting, and global error handling.

#### API routes

All API routes are mounted under `/api`:

- `POST /api/contact`  
  Validates incoming fields (`name`, `email`, `phone`, `message`) and stores a lead.
- `POST /api/auth/register`  
  Creates a Supabase auth user.
- `POST /api/auth/login`  
  Signs in a user and returns session tokens.
- `GET /api/auth/me`  
  Reads bearer token and returns current user profile.

Additional route:

- `GET /health` returns a basic health payload for uptime checks.

#### Data write path for contact submissions

`submitContactForm` follows a fallback strategy:

1. If `DATABASE_URL` is present, insert directly with `pg` into `leads`.
2. Otherwise, use Supabase client insert into the same table.

This supports both direct Postgres access and managed Supabase API access.

### Backend environment variables

Defined in `node-backend/.env.example`:

- `PORT`: backend server port (default `3001`)
- `CORS_ORIGIN`: comma-separated allowed origins
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: service role key for auth/admin + inserts
- `DATABASE_URL`: optional direct Postgres connection string

### Local development workflow

1. **Serve frontend** from repository root (or any static server of your choice).
2. **Run backend**:
   ```bash
   cd node-backend
   npm install
   npm run dev
   ```
3. Ensure frontend contact/auth calls target the backend URL (default local API host is `http://127.0.0.1:3001`).
