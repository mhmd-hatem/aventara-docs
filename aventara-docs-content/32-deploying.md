---
title: Deploying
description: Build and run an Aventara server in production - environment variables, the build, PostgreSQL, schema changes with db push or migrate, CORS, and generating and committing the frontend client.
order: 32
section: guides
---

# Deploying

An Aventara server is a NestJS application. You deploy it like any Node service: install, build, run `dist/main`. The framework adds three things to think about: the generated discovery artifact that must exist before the build, the database schema that must exist before the first request, and the frontend client, which is bound to the contract your server serves.

## Environment

The scaffold reads two variables:

| Variable | Meaning | Default |
|---|---|---|
| `DATABASE_URL` | The database connection string. The server will not start without it: `DATABASE_URL is not set: put it in .env (the start scripts load it) or in the environment.` The check runs while Nest builds the application, before it listens. | none |
| `PORT` | The port `main.ts` listens on. | `3000` |

Locally they live in `.env`. In production, set them in the platform's environment. `npm run start:prod` is:

```json
"start:prod": "node --env-file-if-exists=.env dist/main"
```

`--env-file-if-exists` loads `.env` when it is present and does nothing when it is not, so the same script works on a laptop and on a platform with no file. A real environment variable wins over `.env`: with `DATABASE_URL=file:./override.db npm run start:prod`, the server used `override.db`, not the `.env` value.

Do not commit `.env`. The scaffold's `.gitignore` lists only `/src/generated/` and `/dev.db*`, so add `.env` to it (or `.env*` with an exception for an `.env.example`).

## Build and run

```bash
npm ci                 # installs, then runs `aventara:prepare` (the postinstall script)
npm run build          # nest build -> dist/
npm run start:prod     # node --env-file-if-exists=.env dist/main
```

`npm ci` runs the project's `postinstall` script, which runs `aventara:prepare`: it reads `prisma/schema.prisma`, runs `prisma generate` and writes `src/generated/aventara/discovery.artifact.ts`. Both are generated and git-ignored, and `nest build` needs them. If your pipeline installs with scripts disabled (`npm ci --ignore-scripts`), run `npm run aventara:prepare` yourself before `npm run build`. Re-run it whenever the schema changes.

Prefer building once and running the same artifact everywhere: build in CI, copy `dist/` and a production `node_modules`, and give each environment its own `DATABASE_URL`. Your Prisma client is generated for the provider in `schema.prisma` (SQLite or PostgreSQL), so build with the same schema you deploy.

On start, the host logs one line you can use as a readiness check:

```text
Aventara mounted 45 operations at /api (+ GET /api/_contract, POST /api/_transactions)
```

Call `app.enableShutdownHooks()` in `main.ts` so Nest closes the Prisma client on SIGTERM.

### The server starts without a database

The framework compiles its contracts from the discovery artifact, not from a live connection. A server whose database is unreachable still starts, still mounts its routes and still serves `GET /api/_contract`; a request that needs the database fails with `A3001` ("Adapter execution failed."), and your [diagnostics reporter](/docs/request-ids-and-diagnostics) gets the connection error. This is verified with `DATABASE_URL="postgresql://u:p@127.0.0.1:1/db"` (nothing listening). It is what lets CI generate the frontend client without a database (below). It also means a liveness probe on `/api/_contract` says nothing about the database: add your own health route for that, outside the protocol's `_` paths (for example `GET /api/health`).

## PostgreSQL

Create the project for PostgreSQL, or switch an existing one:

```bash
npx @aventara/cli@rc new my-api --db postgresql
```

The scaffold then differs from SQLite in four places:

```prisma
datasource db {
  provider = "postgresql"
}
```

```ts
// src/prisma.service.ts
import { PrismaPg } from "@prisma/adapter-pg";
super({ adapter: new PrismaPg({ connectionString: url }) });
```

```ts
// src/aventara.config.ts
adapter: await createPrismaAdapter({ client: prisma, discovery, provider: "postgresql", driver: "@prisma/adapter-pg" }),
```

```json
"aventara:prepare": "aventara-prisma7-generate --schema prisma/schema.prisma --client src/generated/prisma --provider postgresql --driver @prisma/adapter-pg --out src/generated/aventara/discovery.artifact.ts"
```

and `.env` gets Prisma's placeholder, which you replace:

```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public"
```

`provider` and `driver` are declared, never sniffed: they must match your schema and the Prisma driver adapter you construct. Changing database means changing all four, then `npm run aventara:prepare`.

Transaction options (`timeout`, `maxWait`, `isolationLevel`) go on the adapter ([Configuration](/docs/configuration#adapter)). SQLite supports `Serializable` only; on PostgreSQL pick the level your invariants need.

> Note: not verified in this release against a live PostgreSQL database in this guide. The PostgreSQL scaffold was generated, built, and started (serving its contract with no database reachable); queries against a real server were not exercised here.

String filters (`contains`, `startsWith`, `endsWith`) are case-insensitive on SQLite and case-sensitive on PostgreSQL. Test on the database you deploy to.

## Creating and changing the schema

Aventara never touches your database or your schema: that is Prisma's job. Two commands:

| Command | Use it for |
|---|---|
| `npx prisma db push` | Development and prototypes. Makes the database match `schema.prisma` right now. No migration history. |
| `npx prisma migrate dev --name <change>` | Development, when you want a history. Writes `prisma/migrations/<timestamp>_<change>/migration.sql` and applies it. Commit the folder. |
| `npx prisma migrate deploy` | Production. Applies the committed migrations that have not run yet. Never generates or resets. |

For production, use migrations: `migrate dev` while developing, commit `prisma/migrations/`, and run `migrate deploy` as a release step before the new server version starts:

```bash
DATABASE_URL=file:./mig.db npx prisma migrate dev --name init
# Applying migration `20261006225019_init`  ... Your database is now in sync with your schema.

DATABASE_URL=file:./mig2.db npx prisma migrate deploy
# 1 migration found ... All migrations have been successfully applied.
```

Prisma 7 reads the connection from `prisma.config.ts`, which the scaffold writes to load `.env` and read `DATABASE_URL`, so the commands see the same variable as the server.

After any schema change, in this order: change `schema.prisma`; migrate (or push); `npm run aventara:prepare`; rebuild; deploy. A new contract has a new hash, so regenerate the frontend client too.

## The frontend client

The generated client is bound to the contract hash of the server it was generated from. A server whose contract changed answers a stale client with `A2005` on every call. Follow these steps:

1. Deploy (or start) the server.
2. Run `npm run avclient:generate` in the frontend, with `AVENTARA_API_URL` pointing at it.
3. Commit the generated files (`src/api/AvClient.ts` and `src/api/generated/`). They are deterministic: the same contract writes the same bytes, so a diff means the contract changed.
4. Build the frontend.

```bash
# in the frontend, in CI
AVENTARA_API_URL=https://staging.example.com/api npm run avclient:generate -- --yes
git diff --exit-code src/api         # fails the build if the committed client is stale
```

If the contract did not change, the generator prints `avclient: up to date: ... nothing was written.` and exits 0.

### Generating in CI against a throwaway server

The server does not need a database to serve its contract, so a frontend pipeline can start the server itself:

```bash
cd api
npm ci && npm run build
DATABASE_URL="file:./ci.db" PORT=3000 node dist/main &      # any valid URL will do; the contract needs no tables
npx wait-on http://localhost:3000/api/_contract
cd ../web
AVENTARA_API_URL=http://localhost:3000/api npm run avclient:generate -- --yes
git diff --exit-code src/api
```

> Note: the commands above were each verified individually (build, start without a database, generate, `up to date`); the assembled CI script was not run end to end here.

### Keeping versions together

The server's contract is checked on every call, so ship the server and the frontend that matches it. A server deployed with a new schema before the frontend is regenerated leaves old frontends getting `A2005` until they update. Mitigations: deploy additive changes (a new nullable column does not break old clients' calls but still changes the hash, so the old client still gets `A2005`), release both together, or serve the previous frontend build until the new one is live.

## CORS and browsers

A browser frontend on another origin needs CORS on the server. Nest's own `enableCors` works on Aventara routes: it is an HTTP-platform middleware, which also runs on the protocol's routes ([NestJS host](/docs/nestjs-host#what-runs-on-aventara-routes)).

The `aventara new` scaffold enables it from `CORS_ORIGINS`, a comma-separated list in the environment. The scaffold's `.env` lists the local dev servers; in production, set it to your deployed frontend's origin (and remove the local ones if they should not be allowed):

```bash
CORS_ORIGINS="https://app.example.com"
```

Unset or empty, CORS is off: no origin is allowed. (`.env` is not committed; set the variable in your hosting environment.) The protocol's custom headers must be allowed, and you may want the request id exposed to browser code. Both are `enableCors` options; the scaffold's call allows the headers by reflecting the request's, so add only the exposure:

```ts
// src/main.ts
app.enableCors({
  origin: corsOrigins.length > 0 ? corsOrigins : false,
  exposedHeaders: ["Aventara-Request-Id"],
});
```

Verified: the preflight `OPTIONS` for `content-type, aventara-protocol-version, aventara-contract-hash, aventara-request-id` answers `204` with `Access-Control-Allow-Origin: https://app.example.com`, the requested headers allowed, and `Access-Control-Expose-Headers: Aventara-Request-Id`; the actual `POST` and `GET /_contract` carry the same origin and expose headers. Authentication via `Authorization` needs `Authorization` allowed too, which `enableCors` does by default by reflecting the request's headers.

CORS is not access control. It tells browsers which origins may read the answers; a server, a script or a bot ignores it. [Guards](/docs/authentication-and-guards) decide who may call, and a [rate limiter](/docs/limits-and-safety#rate-limiting) bounds how often.

## Behind a proxy

- The protocol path is the entrypoint (`/api`), regardless of Nest's global prefix. Route `/api/*` to the server.
- Pass `Aventara-*` and `Authorization` headers through. If your proxy assigns a request id, have it set `Aventara-Request-Id` (not `X-Request-Id`).
- A proxy's own body limit and the framework's `maxRequestBytes` both apply: the stricter one wins.

## Checklist

- [ ] `DATABASE_URL` and `PORT` set in the environment; `.env` not committed.
- [ ] `aventara:prepare` runs before `build` (install scripts enabled, or run it yourself).
- [ ] `prisma migrate deploy` runs before the new server starts.
- [ ] A health route outside `/api/_*`, and `app.enableShutdownHooks()`.
- [ ] `CORS_ORIGINS` set to the deployed frontend's origin, if a browser on another origin calls the API.
- [ ] A [rate limiter](/docs/limits-and-safety#rate-limiting) in front of, or in, the server.
- [ ] Guards and limits set for the client layer: [Authentication and guards](/docs/authentication-and-guards), [Limits and safety](/docs/limits-and-safety).
- [ ] The frontend client regenerated and committed from the deployed contract.

## See also

- [Getting started](/docs/getting-started)
- [Upgrading](/docs/upgrading)
- [Configuration](/docs/configuration#adapter)
- [Frontend client](/docs/keeping-in-sync)
- [Troubleshooting](/docs/troubleshooting)
