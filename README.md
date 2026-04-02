# Fidant.AI – Usage Analytics

A Next.js 15 app implementing the usage analytics API and UI for Fidant.AI's daily turn-based subscription system.

## Stack

- **Next.js 15** (App Router) + **TypeScript** (strict mode)
- **Prisma 5** + **PostgreSQL**
- **Recharts** for the bar chart visualization

---

## Getting Started

### 1. Prerequisites

- Node.js 20+
- PostgreSQL running locally (or a connection string to a hosted instance)

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env and set your DATABASE_URL
```

### 4. Run migrations

```bash
npx prisma migrate deploy
npx prisma generate
```

### 5. Seed demo data (optional)

Creates a `demo@fidant.ai` user and 7 days of sample events.

```bash
npm run db:seed
```

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the UI.

---

## API

### `GET /api/usage/stats?days=7`

Returns usage statistics for the authenticated user.

**Auth:** Pass `x-user-id: <id>` header (see Assumptions below).

**Query params:**
| Param | Type | Default | Range |
|-------|------|---------|-------|
| `days` | integer | `7` | 1–90 |

**Example:**
```bash
curl http://localhost:3000/api/usage/stats?days=7 \
  -H "x-user-id: 1"
```

**Error responses:**
```json
{ "error": { "status": 401, "message": "Unauthorized" } }
{ "error": { "status": 400, "message": "`days` must be between 1 and 90" } }
```

---

## Project Structure

```
src/
  app/
    api/usage/stats/route.ts   # GET endpoint
    page.tsx                   # Demo page
    layout.tsx
  components/
    UsageStats.tsx             # React component (chart + summary)
  lib/
    auth.ts                    # Auth helper
    prisma.ts                  # Prisma singleton
    usage.ts                   # Core stats logic + cache layer
prisma/
  schema.prisma
  migrations/
    20260402000000_init/
    20260402000001_add_daily_usage_cache/
  seed.ts
```

---

## Caching Strategy (Part 3)

The `daily_usage_cache` table stores pre-calculated `committed_count` and `reserved_count` per user per day.

- **Past days** — cache is considered fresh for 1 hour. Historical data rarely changes.
- **Today** — cache expires after 2 minutes to stay reasonably current.
- On a cache miss or stale entry, the API falls back to a raw query against `daily_usage_events` and refreshes the cache asynchronously (fire-and-forget), so the response isn't blocked by the write.

---

## Assumptions

1. **Authentication** — The challenge doesn't specify an auth mechanism, so I used a simple `x-user-id` header. In production this would be replaced with JWT validation or a session lookup middleware.

2. **Timezone** — Dates are computed in UTC. A production system would need to account for user or account timezones when determining `date_key`.

3. **Reserved count** — The spec says to exclude stale reservations (>15 min old) from the `reserved` field. The cache stores the non-stale reserved count at calculation time; for today's cache (refreshed every 2 min) this is accurate enough.

4. **`current_streak`** — Defined as consecutive days ending today with at least 1 committed event. A day with zero events breaks the streak.

5. **`avg_daily`** — Calculated over the full requested period (including zero days), not just active days. This gives a more honest picture of average usage.

---

## What I'd Do Differently With More Time

- **Real auth** — JWT middleware with proper session management.
- **Background cache warming** — A cron job or queue worker to pre-warm cache for all active users, rather than lazy on-request refresh.
- **Timezone support** — Store and respect user/account timezone for `date_key` bucketing.
- **Tests** — Unit tests for `usage.ts` (streak calc, stale threshold logic) and integration tests for the API route with a test database.
- **Pagination / streaming** — For large `days` values (up to 90), streaming the response or paginating would improve perceived performance.
- **Rate limiting** — The stats endpoint itself should be rate-limited to prevent abuse.
