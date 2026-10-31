---
title: The standalone server
description: "Run the standalone Access server with avaccess serve, on a machine or in a container you build."
order: 20
section: multi-service
---

# The standalone server: `avaccess serve`

`avaccess serve` runs the standalone server from a configuration file, with no build step, on a machine or in a
container you build.

## The configuration

`access.config.ts` holds the `createAccess` instance, as its default export or as `access`. It reads its secrets from
the environment. See [The server](/docs/registry-and-cli#the-server) for a registry-only example.

## `avaccess serve`

```sh
avaccess serve [--config <file>] [--port <port>] [--hostname <host>] [--max-body-bytes <bytes>] [--migrate]
```

It finds `access.config.ts` in the working directory (or `.mts`, `.cts`, `.js`, `.mjs`, `.cjs`), loads it without a
build step, and serves it until `SIGTERM` or `SIGINT`, on `127.0.0.1` unless `--hostname` says otherwise.

| Flag or variable | Does | Default |
|---|---|---|
| `--config` | The configuration file | `access.config.ts` in the working directory |
| `--port`, `PORT` | The port | `3000` |
| `--hostname` | The interface | `127.0.0.1` |
| `--max-body-bytes` | `serve`'s body cap | 1 MiB |
| `--migrate`, `AVACCESS_MIGRATE=true` (or `1`) | Runs Better Auth's migration on start | off |

- Without `--migrate`, a database Better Auth migrates itself (a `pg` Pool, a MySQL pool, SQLite) is checked before the
  server listens. One that lacks a table, column or index the options need stops it with exit `1` and the list of what
  is missing.
- A database behind an ORM's adapter (Prisma, Drizzle) is the ORM's to migrate: run `npx auth@~1.7.12 generate --yes`, then the
  ORM's migration. It is served as it is, and `--migrate` refuses it with exit `2`.
- Better Auth limits rates when `NODE_ENV=production`; run `avaccess serve` with it set.
- `GET /health` answers `200 {"status":"ok"}`.
- `SIGTERM` drains the server and ends it with exit `0`.

## Run it in your own container

Access ships no image. Build one from a project that installs the package, Better Auth and whatever your configuration
imports (here `pg`), with its lockfile:

```dockerfile
FROM node:24-slim
WORKDIR /srv/access
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY access.config.ts ./
USER node
EXPOSE 3000
CMD ["node_modules/.bin/avaccess", "serve", "--hostname", "0.0.0.0"]
```

```sh
docker build -t my-access-server .
docker run -p 3000:3000 -e DATABASE_URL=postgresql://... -e BETTER_AUTH_SECRET=... \
  my-access-server node_modules/.bin/avaccess serve --hostname 0.0.0.0 --migrate
```

- `--hostname 0.0.0.0` makes it listen on the container's interfaces; without it, it listens on `127.0.0.1` only.
- Pass `--migrate` (or `-e AVACCESS_MIGRATE=true`) on the start that should create or update the tables.
- The server speaks plain HTTP: put it behind a proxy that terminates TLS. Set Better Auth's
  `advanced.ipAddress.trustedProxies` to that proxy's address, so the client's address comes from its
  `X-Forwarded-For`.
- Install at build time from the lockfile, never when the container starts.
