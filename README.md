# Lawn Craft - Professional Lawn Care Platform

A modern lawn care website with a clean Express.js backend that sends contact form submissions directly to Supabase.

## Project Structure

```text
friendly-telegram/
├── frontend/          # Static site files
├── node-backend/      # Express + Supabase backend
└── README.md
```

## Frontend

The website lives in `frontend/` and serves the public pages for Lawn Craft.

## Backend

The backend lives in `node-backend/` and exposes:

- `GET /health`
- `POST /api/contact`

It uses Express, CORS, dotenv, and the Supabase JS client.

## Local Setup

Start the frontend with a static file server and the backend with Node:

```bash
cd frontend
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
