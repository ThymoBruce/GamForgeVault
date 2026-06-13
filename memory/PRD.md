# GameVault — PRD

## Original Problem Statement
Build a comprehensive, modern Game Collection Catalog web application with auth (prod + dev mode), barcode scanning + eandata/RAWG lookup, manual game add, status & 5-star reviews, gameplay journal, and a friend system. Dark-mode first, gaming-dashboard aesthetic.

## Architecture
- **Backend**: FastAPI + MongoDB (motor). All routes under `/api`.
- **Frontend**: React (CRA + Craco) + Tailwind + Shadcn UI + Lucide.
- **Auth**: Custom JWT email/password (httpOnly cookies) + Emergent Google Auth + UI Dev Mode toggle (localStorage bypass).
- **Image storage**: Emergent Object Storage; uploads served via `/api/files/{path}`.
- **3rd party**: eandata.com (EAN/UPC lookup) + RAWG (game metadata) proxied through backend.

## User Personas
- Solo gamer cataloging their library across consoles/PC.
- Completionist tracking 100% status and play time per game.
- Social gamer comparing collections with friends.

## What's been implemented (2026-02-13)
- JWT auth (register/login/logout/refresh/forgot/reset) + Emergent Google OAuth callback.
- Dev Mode toggle (UI + localStorage; future: env-var driven for production).
- Game CRUD with status, rating, review, gallery (custom photo uploads).
- Filter/sort: status, platform regex, year, alpha A–Z/Z–A, year ↑/↓.
- Barcode scanner using native `BarcodeDetector` API + manual EAN fallback; backend lookup via eandata then RAWG.
- RAWG search by query with one-click "Add" to catalog.
- Gameplay sessions per game (date, duration_minutes, notes) – visible only when status="Playing"; aggregated in `/journal`.
- Friends: user search, friend requests, accept/decline, view friend's catalog (`/users/{id}/games`).
- Stats endpoint powering Dashboard (totals, by_status, by_platform, hours played).
- Mobile menu drawer (Radix Sheet) with a11y title/description.
- Responsive layout, sticky glassmorphism mobile top bar, Steam-inspired moody dark theme.

## Backlog / Next Tasks
- **P1**: Steam integration (SteamID64 import) — skipped per user (no API key yet). Reintroduce when key provided.
- **P1**: Reset-password page (`/reset-password?token=…`) UI – endpoint exists, no UI yet.
- **P2**: Pagination for large catalogs (>1000 titles).
- **P2**: Friend activity feed (recent sessions of friends).
- **P2**: Bulk import (CSV) and bulk export.
- **P3**: PWA manifest + offline-first cache for catalog browsing.
- **P3**: Cache `Cache-Control` headers on `/api/files/*`.
- **P3**: Switch backend `requests` to `httpx.AsyncClient` (async-safe).

## Notes
- Admin seed: `admin@gamevault.com / admin123` (see `/app/memory/test_credentials.md`).
- All endpoints + a11y verified by testing agent (28/28 backend, 100% frontend critical flows).
