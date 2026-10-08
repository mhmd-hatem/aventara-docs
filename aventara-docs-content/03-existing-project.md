---
title: Add to an existing project
description: Use `aventara init` to add Aventara to an existing NestJS 12 project, with or without Prisma.
order: 5
section: get-started
---

# Add Aventara to an existing project

Run `aventara init` inside an existing NestJS 12 project:

```bash
npx @aventara/cli@rc init
```

It refuses, in one sentence and before writing anything, when there is no `package.json`, the project is on another Nest major, TypeScript 7 is installed (the server side needs TypeScript below 7, and `init` says so; a TypeScript 7 *frontend* is fine), only a yarn lockfile exists, or the project is already initialized. ESM and CommonJS projects are both supported.

## No ORM yet

If the project has no Prisma setup, `init` asks for the ORM and database (or take them from `--orm prisma7` and `--db`) and writes the same files as `aventara new` ([what it creates](/docs/getting-started#what-it-creates)): a Prisma schema with a starter `User` model, `prisma.config.ts`, `src/prisma.service.ts`, `src/aventara.config.ts`, a one-time edit of `src/app.module.ts` and `src/main.ts` (CORS, below), `.env`, `.gitignore` entries and the `package.json` scripts and dependencies.

## Prisma is already there

If Prisma is already set up, `init` reuses and never writes your schema, Prisma config, `.env` and Prisma service. It requires the installed Prisma to be one an Aventara adapter supports:

- Prisma 7, `^7.10.0`
- SQLite or PostgreSQL
- a driver adapter (`@prisma/adapter-better-sqlite3` or `@prisma/adapter-pg`)
- the `prisma-client` generator

Otherwise it stops with one sentence and writes nothing.

`init` looks for the class that extends `PrismaClient` (your Prisma service) and for the Nest module that provides and exports it. If it finds more than one, or none, it asks, or you pass them:

```bash
npx @aventara/cli@rc init \
  --prisma-service src/prisma/prisma.service.ts#PrismaService \
  --prisma-module src/prisma/prisma.module.ts#PrismaModule
```

If there is no Prisma service at all, `init` writes `src/prisma.service.ts` for you.

## Flags

Every question has a flag; where nobody can be asked (CI, scripts) pass the flags or `--yes`, otherwise the run stops before writing anything and names what is missing. See the [CLI reference](/docs/cli-reference) for the full table.

Existing content that differs from what would be written (a `.env` key, a script, a file) is listed and replaced only when you confirm, or with `--yes`. That includes a `prebuild`, `prestart`, `prestart:dev` or `prestart:debug` script you already have: `init` adds these four, each running `aventara:prepare`, and keeps yours unless you confirm or pass `--yes`.

## What it changes in `main.ts` and `.env`

`init` makes two small edits so a browser frontend on another origin can call the server ([CORS](/docs/deploying#cors-and-browsers)):

- `src/main.ts` gets an `app.enableCors(...)` call that reads the allowed origins from `CORS_ORIGINS`, followed by a commented-out rate limiter ([Rate limiting](/docs/limits-and-safety#rate-limiting)).
- `.env` gets `CORS_ORIGINS="http://localhost:5173,http://localhost:3001"` (Vite's dev server and a Next.js one beside Nest's port 3000). An existing `.env` keeps its other lines and gets this one appended.

If your `main.ts` already configures CORS (`enableCors`, or a `cors` option on `NestFactory.create`), `init` leaves it as it is, adds no `CORS_ORIGINS` line, and says so:

```text
aventara: warning: src/main.ts already configures CORS, so it was left as it is; a browser frontend on another origin is answered only if that configuration allows it.
```

If it has no `const app = await NestFactory.create(...)` statement to anchor on, it does not edit the file, and prints the lines for you to add after the application is created:

```text
aventara: warning: src/main.ts was not edited: it has no `const app = await NestFactory.create(…);` line; add CORS by hand, as printed below.
```

## After init

`aventara init` shows its steps while it works, like `aventara new` ([Progress](/docs/cli-reference#progress-aventara)), and prints the next steps last. `--verbose` shows the install's output as it runs.

```bash
npx prisma db push      # init never touches a database
npm run start:dev       # GET http://localhost:3000/api/_contract
```

Then set up the frontend with `npx @aventara/client@rc init`.

## Wiring by hand

`init` is a convenience; the result is ordinary code. You can mount Aventara yourself with `AventaraModule`. See [NestJS host](/docs/nestjs-host).

See also: [Authentication and guards](/docs/authentication-and-guards), [Deploying](/docs/deploying), [Server-side usage](/docs/server-side-usage).
