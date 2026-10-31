---
title: "Getting started"
description: "Add Access to a new Aventara app: rules, sign-in, a token, and a first refused request."
order: 4
section: get-started
---

# Getting started

This walks one Aventara NestJS app from nothing to a request that Access allows and one it refuses. The app has a `Note` model. Anyone signed in may read notes, only the author may create or edit their own, only an admin may delete, and a banned user may do nothing.

You need Node.js `^22.23.4 || >=24.22.1` and a PostgreSQL database. For Next.js, the same steps apply: [Hosts](/docs/hosts#nextjs) shows the two files that differ.

## 1. Create the app and install Access

```sh
npx @aventara/cli@rc new notes-api --orm prisma7 --db postgresql --package-manager npm
cd notes-api
npm install --save-exact @aventara/access@rc better-auth@~1.7.12
```

npm 11 may print `npm warn install-scripts ... @prisma/engines, prisma ... not yet covered by allowScripts` after the install. It is expected, and the install still works.

`--package-manager` is needed when the command runs without a terminal; on a terminal it asks. On Node.js 22 also run `npm install --save-exact @node-rs/argon2@2.2.2` ([Installation](/docs/installation)). Set `DATABASE_URL` in `.env`, and add two lines Better Auth reads:

```sh
BETTER_AUTH_SECRET="a long random string"
BETTER_AUTH_URL="http://localhost:3000"
```

`BETTER_AUTH_URL` matters: Access fixes its tokens' issuer to that URL's origin, and refuses to start without a base URL.

## 2. Add the Note model

Open `prisma/schema.prisma` and add:

```prisma
model Note {
  id       Int    @id @default(autoincrement())
  body     String
  authorId String
}
```

Access needs `User.id` to be a `String`, as the scaffold writes it (`id String @id @default(cuid())`), so `authorId` is a `String` too. If your `User.id` is an `Int` (`aventara new` 1.0.0-rc.11 and earlier), make it a `String` now ([User ids](/docs/create-access#user-ids)).

`authorId` is a plain column here. If you add a relation to `User` later, `authorId` becomes a reference, and the caller must be able to read the row it points at. Then also add `grant("signedIn", "read", "User", { where: { id: me.id } })` to the rules and `resources: { users: true }` to `createAccess`. Without the second, startup fails with `ACCESS_OPTIONS_INVALID`. Then create the table and refresh the framework's model:

```sh
npx prisma db push
npm run aventara:prepare
```

`aventara:prepare` writes the discovery artifact your rules are typed from.

## 3. Write the rules

```ts
// src/access.policies.ts
import { definePolicies } from "@aventara/access";
import { model } from "./generated/aventara/discovery.artifact.js";

/** What your app derives for a request: the signed-in user. */
export type Principal = {
	id: string;
	claims: { role?: "admin"; banned?: boolean };
};

export const policies = definePolicies(model)
	.principal<Principal>()
	.roles(() => ({
		admin: { global: { claims: { role: "admin" } } },
	}))
	.grants(({ grant, me }) => [
		grant("signedIn", "read", "Note"),
		grant("signedIn", "create", "Note", { where: { authorId: me.id } }),
		grant("signedIn", "update", "Note", { where: { authorId: me.id } }),
		grant("admin", "delete", "Note"),
	])
	.denies(({ deny }) => [deny("*", "*", { if: { claims: { banned: true } } })]);
```

Read it top to bottom. Nothing is allowed by default. Four grants open the doors. One deny closes all of them for a banned user, whatever the grants say. The `create` and `update` grants hold `authorId` to the caller, so an author cannot write a note as someone else, or hand a note to another author. See [Rules](/docs/rules) and [Updates](/docs/updates).

## 4. Build Better Auth with Access

```ts
// src/access.ts
import { createAccess } from "@aventara/access/auth";
import { PrismaPg } from "@prisma/adapter-pg";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { policies } from "./access.policies.js";
import { PrismaClient } from "./generated/prisma/client.js";

/** Better Auth's own Prisma client: it reads and writes its tables through it. */
const prisma = new PrismaClient({
	adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL ?? "" }),
});

/** What every token carries beside `sub`. */
const claims = { role: "string", banned: "boolean" } as const;

export const access = createAccess({
	betterAuth: {
		database: prismaAdapter(prisma, { provider: "postgresql" }),
		emailAndPassword: { enabled: true },
		user: {
			additionalFields: {
				role: { type: "string", required: false, input: false },
				banned: { type: "boolean", required: false, input: false },
			},
		},
	},
	policies: { rules: policies, claims },
	principal: ({ sub, claims }) => ({
		id: sub,
		claims: {
			...(claims.role === "admin" ? { role: "admin" as const } : {}),
			...(claims.banned === undefined ? {} : { banned: claims.banned }),
		},
	}),
});

export default access;
```

Better Auth's options sit in `betterAuth`, as `betterAuth({...})` takes them. `role` and `banned` have `input: false`, so a user cannot set them at sign-up. Access refuses a claim read from a field the user can set. See [createAccess](/docs/create-access) for every option.

## 5. Create Better Auth's tables

```sh
npx auth@~1.7.12 generate --config src/access.ts --yes
npx prisma validate
npx prisma db push
npm run aventara:prepare
```

`generate` writes Better Auth's models into `prisma/schema.prisma`. It asks before overwriting that file; answer `y`, or pass `--yes` as above. Without a terminal and without `--yes` it exits 0 and writes nothing. The starter `User` becomes Better Auth's `user` table. Open the schema and check that `User` now has the `role` and `banned` columns, then run the last two commands. The first run may print a Babel note about `AvComputedFields`. It changes nothing.

Access closes Better Auth's tables to every request until you open them ([Better Auth tables as Resources](/docs/auth-tables)).

## 6. Mount the routes and wire the engine

Mount Better Auth's handler before Nest's body parser:

```ts
// src/main.ts
import type { IncomingMessage, ServerResponse } from "node:http";
import { NestFactory } from "@nestjs/core";
import { toNodeHandler } from "better-auth/node";
import { access } from "./access.js";
import { AppModule } from "./app.module.js";

async function bootstrap() {
	const app = await NestFactory.create(AppModule);
	// The browser origins allowed to call this server: CORS_ORIGINS in .env,
	// comma-separated. Unset or empty, CORS stays off.
	const corsOrigins = (process.env.CORS_ORIGINS ?? "")
		.split(",")
		.map((origin) => origin.trim())
		.filter(Boolean);
	app.enableCors({ origin: corsOrigins.length > 0 ? corsOrigins : false });
	// Rate limiting: @nestjs/throttler is a Nest guard and does not run on Aventara's
	// routes; a platform-level limiter does. `npm i express-rate-limit`, import
	// { rateLimit } from 'express-rate-limit', pick your limits and uncomment below.
	// See: https://aventara.razor34.dev/framework/docs/limits-and-safety#rate-limiting
	// app.use(rateLimit({ windowMs: 60_000, limit: 100 }));
	const auth = toNodeHandler(access);
	app.use(
		(request: IncomingMessage, response: ServerResponse, next: () => void) =>
			request.url?.startsWith("/api/auth/") ? auth(request, response) : next(),
	);
	await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

This is the whole `main.ts`: the CORS and rate-limit lines the scaffold wrote come first, then the mount, so copy the block as it is. Now hand `access` to the framework in `src/app.module.ts`: import it, and add it to the `config` beside `adapter`:

```ts
import { access } from './access.js';
// ...
useFactory: async (prisma: PrismaService) => ({
  config: {
    ...aventaraConfig,
    adapter: await createPrismaAdapter({ ...adapter, client: prisma }),
    access,
  },
}),
```

Leave `policy` out of `aventaraConfig`. Access brings the engine and each request's `me`. The full files are on [Hosts](/docs/hosts#nestjs).

## 7. Run it and try it

```sh
npm run start:dev
```

Sign up, sign in, and trade the session for a token. Send an `Origin` header that matches your base URL:

```sh
curl -X POST http://localhost:3000/api/auth/sign-up/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{ "email": "ada@example.com", "password": "correct-horse-battery", "name": "Ada" }'

curl -c cookies.txt -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{ "email": "ada@example.com", "password": "correct-horse-battery" }'

TOKEN=$(curl -s -b cookies.txt http://localhost:3000/api/auth/token | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).token')
```

Now call the API with the token. Every operation needs the contract hash ([HTTP protocol](https://aventara.razor34.dev/framework/docs/http-protocol)):

```sh
HASH=$(curl -s http://localhost:3000/api/_contract | node -pe 'JSON.parse(require("fs").readFileSync(0, "utf8")).protocol.hash')

# Allowed: a signed-in user reads notes.
curl -s -X POST http://localhost:3000/api/_resources/Note/find/many \
  -H 'Content-Type: application/json' -H 'Aventara-Protocol-Version: 1' \
  -H "Aventara-Contract-Hash: $HASH" -H "Authorization: Bearer $TOKEN" -d '{}'

# Refused: no token, so no one is signed in and no grant matches.
curl -s -X POST http://localhost:3000/api/_resources/Note/find/many \
  -H 'Content-Type: application/json' -H 'Aventara-Protocol-Version: 1' \
  -H "Aventara-Contract-Hash: $HASH" -d '{}'
```

The second call answers `403` with code `A4002`. The framework refuses it because the rules name no grant for the anonymous caller. To see a ban work, set `banned` to `true` on the user and ask for a new token: every request with it is refused. A token issued before the ban keeps working until it expires (at most `policies.tokenTtl`, 15 minutes); only new tokens are refused. With the Prisma client that is `await prisma.user.update({ where: { email: "ada@example.com" }, data: { banned: true } })`.

## What next

- Understand the language: [Rules](/docs/rules).
- Learn what the token carries: [createAccess](/docs/create-access#claims).
- Record decisions: [The audit log](/docs/audit-log).
- Let users sign in from a page: [The $access verbs](/docs/access-verbs).
- Lost? [Troubleshooting](/docs/troubleshooting).
