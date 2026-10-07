---
title: Client setup
description: Set up a frontend with avclient init - flags, framework.client.ts, env variable or literal entrypoint, generateAt, how to import the client in Vite, Next.js and Node projects, and CORS.
order: 51
section: frontend
---

# Client setup

`avclient init` turns an existing frontend project into one that has a typed client of your Aventara API. It writes a small config file, wires a script, installs the generator and generates the client. The server must be running when it generates.

The project needs a `tsconfig.json`: the generated client is TypeScript, compiled by your own toolchain. A plain JavaScript project is not supported yet, and `init` says so before it touches anything (see [Troubleshooting](#troubleshooting)).

## Run init

In your frontend project (not the server):

```bash
npx @aventara/client@pilot init           # asks four questions
npx @aventara/client@pilot init --yes     # accepts every default
pnpm dlx @aventara/client@pilot init      # pnpm
```

| Flag | Meaning | Default |
|---|---|---|
| `--entrypoint <url>` | The server's entrypoint: origin plus mount path | `http://localhost:3000/api` |
| `--env-var <NAME>` | Read the entrypoint from this variable | `AVENTARA_API_URL` |
| `--no-env-var` | Write the entrypoint into the config as a literal | |
| `--generate-at <dir>` | Where the client goes | `./src/api` |
| `--package-manager <npm\|pnpm>` | Which one installs | the lockfile's, else the one that launched init, else npm |
| `--skip-install` | Print the install command instead of running it | |
| `--skip-generate` | Do not generate now | |
| `-y, --yes` | Accept defaults, and replace differing content without asking | |

Init writes `framework.client.ts`, the variable into `.env` (only when you chose a variable), an `"avclient:generate": "avclient generate"` script, and `@aventara/client` as an **exact** dev dependency. It also adds `.env` to the frontend's `.gitignore`. Content that already exists and differs is listed and replaced only when you confirm (or pass `--yes`); where nobody can be asked, nothing is touched. `avclient --version` prints the generator's version.

If the server does not answer, init still writes the files and tells you to run `avclient generate` once it is up:

```text
avclient: the project is set up, but the server did not answer (GET http://localhost:3000/api/_contract answered HTTP 404, not the ClientContract. Check that the deployment is running and that the entrypoint is its origin plus mount path); once it is running, run `avclient generate`.
```

Note the default port is 3000. If your server listens elsewhere, pass `--entrypoint`.

## framework.client.ts

The config is a plain module:

```ts
import { defineClientConfig, env } from "@aventara/client";

export default defineClientConfig({
  entrypoint: env("AVENTARA_API_URL"),
  generateAt: "./src/api",
});
```

| Option | Meaning |
|---|---|
| `entrypoint` | One absolute `http(s)` URL: origin plus mount path, for example `http://localhost:3103/api`. It may not contain credentials. A trailing slash is fine. |
| `generateAt` | The directory the client is written into. You may share it with your own files. |

The generator loads the config the way Prisma loads `prisma.config`: it looks for `framework.client.ts`, `.mts`, `.cts`, `.js`, `.mjs` or `.cjs` in the project root, in ESM or CommonJS syntax, whatever your package's `"type"` is. A `framework.client.mts` written by `0.1.0-pilot.1` keeps working, and `avclient init` leaves it in place. Only one such file may exist; with two the generator stops and asks you to keep one:

```text
avclient: framework.client.ts and framework.client.cjs are both in /path/to/project, and only one may configure the generator; keep one and delete the other.
```

### Environment variable or literal

| | `env("AVENTARA_API_URL")` | Literal string |
|---|---|---|
| Created by | default | `--no-env-var` |
| Good for | One config, different servers per environment (`.env`, CI) | A project with a single known deployment |
| Needs | The variable at **generate** time | Nothing |

```ts
// literal
export default defineClientConfig({
  entrypoint: "https://api.example.com/api",
  generateAt: "./client",
});
```

`env("NAME")` reads, highest precedence first: the process environment, `.env.<mode>.local`, `.env.<mode>`, `.env.local`, `.env` (`mode` is `NODE_ENV`, or `development`).

The variable is read when you **generate**, not when your app runs: the entrypoint becomes the generated client's default. To call a different deployment at runtime (staging, tests, SSR), pass `entrypoint` to `new AvClient(...)`, see [Client options](/docs/client-options).

The entrypoint must be an absolute URL. A relative one such as `/api` does not work as a client entrypoint, so a frontend that is served from the same origin as the API still uses the full URL.

## What is generated

```text
src/api/
  AvClient.ts          the entry point you import
  generated/           the typed client, contract, runtime and types
```

The generator owns exactly those two entries in `generateAt` and never touches anything else there. **Commit the generated files**, never edit them, and regenerate when the server's contract changes ([Keeping in sync](/docs/keeping-in-sync)). Output is deterministic: two runs over the same contract write identical bytes.

The client is `.ts` source, and its files import each other the way your project's `tsconfig.json` says (the rules Prisma 7's `prisma-client` generator follows): no extension under `moduleResolution` `bundler`, `.js` under `nodenext`, `.ts` when the project compiles `.ts` imports (`allowImportingTsExtensions` or Node's type stripping). The generator picks the right spelling by reading your `tsconfig.json`, so the client compiles with your own settings and needs no bundler or compiler configuration.

After writing, the generator type-checks the output with **your project's own TypeScript** before it replaces the old one (`checked: types`). If `typescript` is not installed in the project, or it is TypeScript 7 (which has no classic compiler API to check with), it checks syntax and shape only and says so in one warning; the client is still generated, and your own `tsc` checks it when it compiles. Verified with TypeScript 7.0.2.

## Importing the client

Import `AvClient.ts` the way you import your own files; the path depends on `generateAt` and on the file you import from. Which spelling is right depends on the project, the same way it does for your other imports:

| Project | Import |
|---|---|
| Next.js (Turbopack and webpack) | `import avClient, { type User } from "../api/AvClient";` (path per `generateAt`; an alias such as `@/api/AvClient` works too) |
| Vite (`react-ts` and similar) | `import avClient from "./api/AvClient";` (`./api/AvClient.ts` works too) |
| `nodenext` ESM, including a NestJS 12 project | `import avClient from "./api/AvClient.js";` |
| Node running `.ts` files directly (type stripping) | `import avClient from "./api/AvClient.ts";` |

Plain JavaScript projects are not supported yet.

## Project notes

### Vite (React)

Works with the stock `react-ts` template, including its strict settings (`erasableSyntaxOnly`, `noUnusedLocals`, `verbatimModuleSyntax`): `tsc -b && vite build` passes with the client in `src/api`.

```bash
npm create vite@latest web -- --template react-ts
cd web && npm install
npx @aventara/client@pilot init --yes --entrypoint http://localhost:3000/api
```

```tsx
import { useEffect, useState } from "react";
import avClient, { type User } from "./api/AvClient";

export default function App() {
  const [users, setUsers] = useState<readonly Pick<User, "id" | "email">[]>([]);
  useEffect(() => {
    avClient.User.find.many({ select: ["id", "email"], limit: 10 }).then(setUsers);
  }, []);
  return <ul>{users.map((u) => <li key={u.id}>{u.email}</li>)}</ul>;
}
```

List results are `readonly` arrays, so state that holds them is typed `readonly` too (see [Typed calls](/docs/typed-calls)).

The Vite template's root `tsconfig.json` compiles nothing itself and points at `tsconfig.app.json`; the generator follows that reference, so no extra setup is needed. The browser calls your API from another origin, so the server must allow it: see [Browsers and CORS](#browsers-and-cors).

### Next.js

Tested with Next.js 16.4, with Turbopack (the default) and with `--webpack`. The client needs no `next.config.ts` change and no extension alias: import it extensionless.

From 16.4, new projects have `cacheComponents` on. Under it, a page that fetches on every request must read the data inside a `<Suspense>` boundary, after `await connection()`. A server component then calls the client directly:

```tsx
// src/app/page.tsx
import { Suspense } from "react";
import { connection } from "next/server";
import avClient from "../api/AvClient";

async function Users() {
  await connection();
  const users = await avClient.User.find.many({ select: ["id", "email"], limit: 10 });
  return <ul>{users.map((u) => <li key={u.id}>{u.email}</li>)}</ul>;
}

export default function Home() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Users />
    </Suspense>
  );
}
```

`next build` prerenders the shell and streams the list at request time (`◐ /`, Partial Prerender). Two mistakes to avoid, both verified against `next build`:

- **`export const dynamic = "force-dynamic"`** fails the build under `cacheComponents`:

  ```text
  Error: Route segment config "dynamic" is not compatible with `nextConfig.cacheComponents`. Please remove it.
  ```

  Use `connection()` inside `<Suspense>` instead.
- **Awaiting the client outside `<Suspense>`** fails the build with `Next.js encountered uncached or runtime data during prerendering`. Move the await into a component under a `<Suspense>` boundary.

Server-side calls need no CORS; calls from client components do (see below).

### Node and NestJS (ESM)

A `nodenext` ES module project, a NestJS 12 project included, imports with `.js`; a project that runs `.ts` files directly with Node's type stripping imports with `.ts`:

```ts
// src/script.ts, nodenext ESM
import avClient from "./api/AvClient.js";

console.log(await avClient.User.find.count({}));
```

```bash
npx tsx src/script.ts          # prints the count
```

Notes:

- Top-level `await` needs an ES module (`"type": "module"`). In a CommonJS project, wrap calls in an `async function main()`.
- Plain `node src/script.ts` runs the client only when the project imports with `.ts` (type stripping). A `nodenext` project that imports `./api/AvClient.js` runs through `tsx` or after compiling.
- The client uses the platform `fetch`: Node 22 or later has it.

## Browsers and CORS

A browser frontend on another origin than the API (Vite's `5173`, a Next.js dev server on `3001`) can call the server only if the server allows its origin. The `aventara new` scaffold does that from `CORS_ORIGINS` in the server's `.env`, a comma-separated list (default `http://localhost:5173,http://localhost:3001`). Add your frontend's origin to it, in each environment, then restart the server.

The preflight that browsers send for the client's own headers (`Content-Type`, `Aventara-Protocol-Version`, `Aventara-Contract-Hash`, and your `Authorization`) is answered by it. Verified against the scaffold:

```text
# allowed origin
Access-Control-Allow-Origin: http://localhost:5173
# another origin: no Access-Control-Allow-Origin header, so the browser blocks the response
```

CORS is a browser rule, not access control. A server, a script or a bot ignores it, so it does not decide who may call; [guards](/docs/authentication-and-guards) do. Server-side calls (a Next.js server component, a Node script) are not subject to CORS at all. See also [Express and Fastify](/docs/express-and-fastify#cors) and [Deploying](/docs/deploying#cors-and-browsers).

## Troubleshooting

| Message | Cause |
|---|---|
| `answered HTTP 404, not the ClientContract` | Wrong entrypoint (port or mount path), or something else is on that port. |
| `ECONNREFUSED` | The server is not running. |
| `typescript could not be resolved` | `typescript` is not installed in the project; the client is generated with a syntax-only check. |
| `no tsconfig.json was found in ... or any directory above it` | The project has no `tsconfig.json`: it is plain JavaScript, which is not supported yet. Nothing was written. Add a `tsconfig.json` (`npx tsc --init`) and run init again. |
| `... are both in ..., and only one may configure the generator` | Two `framework.client.*` files exist. Keep one and delete the other. |
| A browser console error about CORS, or a `TransportError` with `status` `null` | The server does not allow your frontend's origin. Add it to `CORS_ORIGINS` and restart the server. |

### Known issues

**The generated client's imports do not match my compiler (a monorepo or a non-standard layout).** The generator reads the nearest `tsconfig.json` above `generateAt`. In a monorepo or with a differently named config, that may not be the one your project compiles the client with, and then the imports or module format do not match your compiler (for example `Cannot find module './generated/client.js'`, or an extension your bundler will not resolve). Name the right config in `framework.client.ts`, as a file name or a path relative to the config file, then run `avclient generate` again:

```ts
export default defineClientConfig({
  entrypoint: env("AVENTARA_API_URL"),
  generateAt: "./src/api",
  tsconfigFile: "./tsconfig.app.json",
});
```

A named file that is missing or unreadable is refused, with the path it resolved to.

## See also

- [Typed calls](/docs/typed-calls)
- [Client options](/docs/client-options)
- [Keeping in sync](/docs/keeping-in-sync)
- [CLI reference](/docs/cli-reference#avclient-init)
- [Getting started](/docs/getting-started)
- Guides: [Deploying](/docs/deploying), [Authentication and guards](/docs/authentication-and-guards)
