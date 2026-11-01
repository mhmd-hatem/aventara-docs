---
title: MCP
description: Serve your API to AI agents over the Model Context Protocol - turn on mcp, choose what the agent layer exposes, the tools and the contract resource, OAuth with a verify function, and connecting Claude Code or Claude Desktop.
order: 64
section: hosting
---

# MCP

Aventara can serve your API to AI agents over the [Model Context Protocol](https://modelcontextprotocol.io) (MCP). An agent such as Claude Code or Claude Desktop connects to your application, reads what your resources look like, and calls `find`, `create`, `update`, `delete`, `upsert` and `transaction` tools. Every call goes through the same validation, exposure and pipelines as a call from your frontend, and runs as its own origin, `agent`, so your guards can treat agents differently.

The MCP server runs inside your NestJS application. There is no separate process to deploy.

This page is about your application serving its data to agents. For the coding agent that builds your application (its skill, and connecting it to your dev server), see [Working with AI agents](/docs/ai-agents).

## Setup

Install `@aventara/mcp` beside `@aventara/nest`, pinned to the same version as `@aventara/core` (here, `1.0.0-rc.12`):

```bash
npm install --save-exact @aventara/mcp@rc
```

Pin it exactly, like the other Aventara packages. `@aventara/nest` declares `@aventara/mcp` as an optional peer at its own exact version, so a caret range can install a release that does not match it.

Add `mcp` to `src/aventara.config.ts` with the path to serve it at:

```ts
export const aventaraConfig = {
  api: "/api",
  mcp: "/mcp",
  exposed: true,
} as const;
```

Start the server. The log shows the endpoint next to the protocol's routes:

```text
[AventaraModule] Aventara mounted 9 operations at /api (+ GET /api/_contract, POST /api/_transactions, POST /api/_all)
[AventaraModule] Aventara mounted the MCP endpoint at /mcp (no authorization: it answers callers on this machine only)
```

If `mcp` is set and `@aventara/mcp` is not installed, the application refuses to start and gives the install command, pinned to the `@aventara/core` version you have:

```text
AventaraModule: the configuration has `mcp`, and the package that serves it, @aventara/mcp, is not installed. Install it at @aventara/core's exact version (npm install --save-exact @aventara/mcp@1.0.0-rc.12), or remove `mcp` from the configuration.
```

The path follows the same rules as `api`, and it cannot be `api` itself or sit inside the protocol's `_` routes. See [Configuration](/docs/configuration#the-agent-layer-and-mcp).

### On Next.js

In a [Next.js app](/docs/nextjs-host#mcp), `mcp` goes into the options of `Aventara({...})` in `src/aventara/server.ts`, and the same `handlers` serve the endpoint. Add two one-line route files that re-export `handlers`: `src/app/mcp/route.ts` (`GET`, `POST`, `DELETE`) for the endpoint, and `src/app/.well-known/oauth-protected-resource/mcp/route.ts` (`GET`) for the metadata. The folder names follow `mcp.path`.

On Next.js, `mcp` needs [`authorization`](#authorization). Next.js adds `x-forwarded-for` to every request, so an endpoint without authorization, which answers only local callers with no forwarding header, would refuse every caller. An `mcp` written without `authorization` is a type error on the `Aventara({...})` call, and a configuration typed as `AvConfig` without it is refused when the framework is built.

The metadata document and the `401` name the endpoint at the origin the agent called: `X-Forwarded-Host` and `X-Forwarded-Proto` when present, else `Host`. Everything else on this page applies as it is.

## What an agent can reach: the agent layer

The tools come from the `agent` layer of your configuration. Without an `agent` key, an agent sees exactly what your frontend sees (the `client` layer). To give agents less, add an `agent` layer and hide what they should not touch:

```ts
agent: {
  exposed: true,
  exemptions: {
    resources: {
      AuditLog: true,                                      // agents never see the audit log
      User: { operations: { delete: true } },              // and never delete users
    },
  },
},
```

`extends` picks the layer the agent starts from: `"client"` (the default), `"application"` or `"root"`. The agent layer can only hide more than the layer it extends, never less. Hiding a resource also means hiding the relations that point to it from resources the agent still sees; startup tells you which one with `COMPILER_DANGLING_RELATION`.

The full rules, including how pipelines add up along the chain, are in [Configuration](/docs/configuration#the-agent-layer-and-mcp) and [Exposure](/docs/exposure).

## The tools

There is one tool per operation family the agent layer exposes. A family that nothing exposes has no tool.

| Tool | Arguments | Marked as |
|---|---|---|
| `find` | `{ resource, variant, args? }` | read-only |
| `create` | `{ resource, variant, args }` | not destructive |
| `update` | `{ resource, variant, args }` | destructive |
| `delete` | `{ resource, variant, args }` | destructive |
| `upsert` | `{ resource, variant, args }` | destructive |
| `transaction` | `{ steps: [{ resource, family, variant, args? }] }` | destructive |

- `resource` and `variant` are lists of allowed values built from the agent layer, so an agent only sees resources and variants it may use. Each tool's description also lists which variants each resource offers.
- `args` is the same object a frontend sends: `where`, `select`, `include`, `orderBy`, `limit`, `offset`, `cursor`, `data`, and `create`/`update` for `upsert`. See [Querying](/docs/querying).
- `transaction` appears when the agent layer's transactions are interactive. A step can use a value from an earlier step with `{ "$ref": { "operation": 0, "path": ["id"] } }`. The agent does not compute fingerprints; the server adds them. See [Transactions with $ref](/docs/transactions-with-ref).

A call looks like this:

```json
{
  "name": "find",
  "arguments": {
    "resource": "Post",
    "variant": "many",
    "args": { "where": { "published": { "equals": true } }, "select": ["id", "title"], "limit": 10 }
  }
}
```

### Results and errors

A successful call returns the usual envelope as structured content and as text:

```json
{ "data": [{ "id": 1, "title": "Hello" }], "code": "A1000", "cause": null }
```

A failed call returns an MCP tool error (`isError: true`) with the same envelope. The `cause` carries the issues, each with `path`, `code` and `message` (and `check`, `params` for a field validator), so the agent can fix its arguments and try again:

```json
{
  "data": null,
  "code": "A2004",
  "cause": {
    "message": "Operation arguments failed framework validation.",
    "issues": [{ "path": ["arguments", "data", "title"], "code": "V1001", "message": "Value must be a string." }]
  }
}
```

An issue's path starts at `arguments`, which is the call's `args`. In a transaction it starts at `operations[<step>].args`, and `cause.operation` is the failing step. A failed transaction changes nothing. A call to a family or variant the resource does not offer points at the tool's own input instead, `["family"]` or `["variant"]`, not at `arguments`. A resource the agent layer does not offer is `A2001` at `["resource"]`, as over HTTP; a name JSON can carry but a URL cannot (a lone surrogate) is that unknown name. The codes are listed in [Error codes](/docs/error-codes).

## The contract resource

The server also exposes the agent contract as an MCP resource, `aventara://contract`. It lists every resource the agent can reach, its fields and their types, what can be filtered, selected, created and updated, and the request limits. The tool descriptions and the server's instructions tell the agent to read it first.

It is the same document as `GET /api/_contract`, compiled from the agent layer instead of the client layer.

## Keeping agents safe

What an agent may do is decided by exposure and by your guards, the same way as for every other caller. A guard can tell an agent's call apart by its origin:

```ts
import type { AvContext, AvGuard } from "@aventara/core";

const noAgents: AvGuard = (ctx) => ctx.$origin !== "agent";

// Agents may read orders but not change them.
resources: {
  Order: {
    pipelines: {
      guards: [(ctx: AvContext) => ctx.$origin !== "agent" || ctx.$operation.family === "find"],
    },
  },
},
```

The inline guard is annotated with `AvContext`: in the `as const` configuration that `aventara init` writes, an unannotated inline stage is an error (TS7006, see [The pipeline context](/docs/pipeline-context)). A named `AvGuard` such as `noAgents` needs nothing more.

The "read-only" and "destructive" marks in the tool list are hints for the agent's client, which may ask you before running a destructive tool. They do not enforce anything.

## Authorization

Without `authorization`, the endpoint takes no token. To keep that safe it only answers callers on the same machine: a loopback address, no proxy forwarding header (`Forwarded`, `X-Forwarded-For`, `X-Real-IP`), and no `Origin` header other than a local one. Anything else gets `403`. This suits local development and an agent running next to your server.

To serve agents over the network, add `authorization`. The endpoint then follows the MCP authorization spec as an OAuth 2.1 protected resource. Your authorization server (Auth0, Keycloak, Clerk, your own) issues the tokens; Aventara only checks them.

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const issuer = "https://auth.example.com";
const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

export const aventaraConfig = {
  api: "/api",
  mcp: {
    path: "/mcp",
    authorization: {
      servers: [issuer],
      verify: async (token: string) => {
        try {
          const { payload } = await jwtVerify(token, jwks, {
            issuer,
            audience: "https://api.example.com/mcp",
          });
          return payload;
        } catch (error) {
          // A rejected token is a normal 401, not logged by Aventara; log it here to see why.
          console.warn("MCP token rejected", error);
          return null;
        }
      },
    },
  },
  // ...
} as const;
```

With `authorization` set:

- `GET /.well-known/oauth-protected-resource/mcp` returns the protected resource metadata: your endpoint's URL as `resource`, your `servers` as `authorization_servers`, and `bearer_methods_supported: ["header"]`. MCP clients read it to find where to sign in.
- A request without a bearer token (no `Authorization` header, or another scheme such as `Basic`) gets `401` with `WWW-Authenticate: Bearer resource_metadata="https://api.example.com/.well-known/oauth-protected-resource/mcp"`. As the OAuth bearer token spec asks, the header carries no error code here: there was no token to be wrong.
- Every token goes to `verify`. If it returns `null` or `undefined`, or throws, the answer is `401` with `WWW-Authenticate: Bearer error="invalid_token", error_description="The access token is invalid", resource_metadata="..."`. A rejected token is not logged, so log inside `verify` if you want the reason, as the `catch` above does. A `verify` that throws is also reported to your [`diagnostics`](/docs/config-reference#diagnostics) sink, as a diagnostic of `kind: "mcp"` holding the thrown error, so a broken key set or an unreachable issuer shows up in your logs. Otherwise the request goes through.
- Whatever `verify` returned is available to your stages as `ctx.$state.mcp.claims`, next to whatever your [`state` option](/docs/nestjs-host) seeds.

Declare the claims' type with the rest of your request state:

```ts
import type { JWTPayload } from "jose";

declare module "@aventara/core" {
  interface AvState {
    mcp?: { claims: JWTPayload };
  }
}

const canWrite: AvGuard = (ctx) =>
  ctx.$origin !== "agent" ||
  ctx.$operation.family === "find" ||
  String(ctx.$state.mcp?.claims.scope ?? "").split(" ").includes("write");
```

With a [policy](/docs/policies) configured, every tool call is checked as an agent request (`origin: "agent"`). `policy.principal` derives the principal from the same `$state`, so it can read `$state.mcp.claims`. The engine can narrow what an agent may do beyond what a client may.

Check the token's audience in `verify` (here `https://api.example.com/mcp`), so a token issued for another service is not accepted.

Behind a proxy or load balancer, the metadata's URLs are built from the request as your platform sees it. Set Express's `trust proxy` (`app.set("trust proxy", 1)`) or Fastify's `trustProxy` option, so they carry `https` and your public host name.

## Connecting a client

The endpoint speaks MCP's Streamable HTTP transport and keeps no sessions: each request is answered on its own. Any MCP client that supports Streamable HTTP can connect.

### Claude Code

```bash
# A local server without authorization
claude mcp add --transport http my-api http://localhost:3000/mcp

# With a token you already have
claude mcp add --transport http my-api https://api.example.com/mcp \
  --header "Authorization: Bearer $TOKEN"
```

For a server with `authorization`, Claude Code can also run the OAuth sign-in itself: add the server without a header, then run `/mcp` in Claude Code and choose to authenticate.

### Claude Desktop

Add a remote server as a custom connector (Settings, then Connectors) with your endpoint's URL, for example `https://api.example.com/mcp`. Claude signs in through your authorization server using the metadata above. A connector must be reachable from the internet over `https`, so it needs `authorization`.

For a server on your own machine, use a local bridge such as `mcp-remote` in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "my-api": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "http://localhost:3000/mcp"]
    }
  }
}
```

Client menus and commands change between versions; check your client's own documentation if a step above looks different.

### Trying it by hand

```bash
curl -s http://localhost:3000/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Details

- `GET` and `DELETE` on the endpoint return `405`: there are no sessions to open or close.
- A request body is limited to the agent layer's `maxRequestBytes` (`413` above it). Compressed request bodies are refused with `415`.
- The server reports its name as `aventara` and its version as the agent contract's hash, so a client can tell when the tools changed.
- The endpoint runs on Express and on Fastify. Nest guards, interceptors and pipes do not run on it, the same as on the protocol's routes.
