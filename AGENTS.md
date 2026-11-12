# Instructions

# Project Overview

This project uses the following technologies:

- Bun (runtime, `Bun.env` + `Bun.file`)
- Hono on `Bun.serve` (API, entry `src/main.ts`)
- SolidJS + DaisyUI + Tailwind (frontend SPA in `src/client`, built with Vite)
- SSE + WebSockets (SSE for job progress, WS for ComfyUI queue events)
- SQLite with Kysely (DB-backed job queue, migrations in `migrations/`)

Local services: ComfyUI (image/video/audio), LM Studio (LLM + embeddings),
optional Voicebox (TTS) and ChromaDB (gallery vector search).

# Development

Setup:

```bash
cp .env.example .env   # edit paths, model ids, HOST/PORT
bun install
bun run db:migrate      # creates data/silicon-seeds.sqlite (override via DB_PATH)
bun run build:css       # builds static/style.css from src/client/index.css
```

Start the server in hot reload mode:

```bash
bun run start:hot
```

Verify the server's response using `curl`:

```bash
curl http://localhost:3000/api/health   # -> {"status":"up"}
```

Example job URL:

http://localhost:3000/jobs/019d4556-bbe7-7000-88da-b48bf06182dc?tab=overview

Server binds `HOST`/`PORT` from env (defaults `127.0.0.1`/`3000`).
Set `HOST=0.0.0.0` only on trusted networks, app has no auth.

# Checks

```bash
bun run test       # tsc (server) + tsc (client) + eslint (no services needed)
bun run test:unit  # bun test src (pure logic, no services needed)
bun run lint       # eslint only
bun run test:e2e   # Playwright against running app (e2e/helpers/test.ts blocks GPU/LLM requests)
```

# Documentation

Architecture source of truth: `README.md` (repo root).

Note: `docs/` is gitignored (local reference notes only, not in repo).
`docs/superpowers/` pipeline specs/plans stay tracked as work record.
