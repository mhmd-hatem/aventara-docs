---
title: Contract hash
description: What the client contract hash covers, how ETag and 304 use it, what the A2005 refusal means, and the regenerate workflow that keeps client and server in step.
order: 14
section: concepts
---

# Contract hash

The **client contract** is the only contract a remote caller sees. It carries a **hash**, `sha256:` followed by 64 hex characters, computed over everything it advertises. The hash is the identity of the API a client was generated against, and the server uses it to refuse a client that is out of date instead of letting it send requests the server no longer understands.

## What is in the hash

The hash covers the whole client contract, not just the schema:

| Changes the hash | Does not change the hash |
|---|---|
| Adding, removing or retyping a field in the schema | Pipelines: guards, hooks, pipes (server-side code) |
| A restriction in the client layer (a hidden field, a write-only field, a switched-off operation) | Anything that exists only in the application layer |
| A client limit (`maxListLimit`, `maxNestingDepth`, ...) | A field hidden from the client, added to the schema (the client contract is unchanged) |
| Transaction support (`interactive` or `none`) | Restarting the server with the same schema and configuration |

The same schema and configuration always produce the same hash.

```text
# before: default limits                                       sha256:328f2f63…
# after:  maxListLimit 100 + a write-only client field          sha256:10eb4ae2…
# then:   add a client guard pipeline                           sha256:10eb4ae2…   (unchanged)
```

Sample hashes on this page are illustrative; yours differ per deployment.

## ETag and 304

`GET <entrypoint>/_contract` serves the client contract as canonical JSON, with the quoted hash as its `ETag` and `Cache-Control: no-cache`. It needs no identity headers.

```bash
curl -i http://localhost:3000/api/_contract
```

```text
HTTP/1.1 200 OK
Content-Type: application/json
ETag: "sha256:328f2f635e7b3dbd38ced7f55ee294a575612500c24329e7779cde7a65d1c9f9"
Cache-Control: no-cache
Aventara-Request-Id: 6f648ebf-7c4a-4014-96bf-7a87670097a7
```

Send the hash back as `If-None-Match` to revalidate cheaply. A match answers `304 Not Modified` with no body:

```bash
curl -i http://localhost:3000/api/_contract -H 'If-None-Match: "sha256:328f2f635e7b3dbd38ced7f55ee294a575612500c24329e7779cde7a65d1c9f9"'
# HTTP/1.1 304 Not Modified
```

`avclient generate` does exactly this to decide whether anything needs writing:

```text
avclient: up to date: ./src/api already holds this deployment's client; nothing was written.
```

## A2005: the stale client

Every `_resources` and `_transactions` request carries two identity headers: `Aventara-Protocol-Version` and `Aventara-Contract-Hash`. The generated client sends both, filled from the contract it was generated from. If the hash is not the server's current one, the request is refused before it is interpreted:

```bash
curl -i -X POST http://localhost:3000/api/_resources/User/find/count \
  -H 'Content-Type: application/json' \
  -H 'Aventara-Protocol-Version: 1' \
  -H 'Aventara-Contract-Hash: sha256:0000000000000000000000000000000000000000000000000000000000000000' \
  -d '{}'
```

```text
HTTP/1.1 409 Conflict
{"data":null,"code":"A2005","cause":{"message":"Generated client contract does not match the server. Regenerate the client."}}
```

The generated client turns it into a typed error:

```ts
import avClient, { ContractMismatchError } from "./api/AvClient";

try {
  await avClient.User.find.count();
} catch (e) {
  if (e instanceof ContractMismatchError) {
    // e.code === "A2005": show "please update the app", or reload
  }
}
```

A request that omits the identity headers answers `400 A2000` and names the missing headers. A protocol version the server does not speak answers `A2006`.

The point of the refusal is correctness: a client built against an older contract might send a field that is now hidden, or rely on an operation that was removed. Failing early, with a message that says what to do, is better than a half-understood request.

## The regenerate workflow

Regenerate the client whenever the deployment's client contract changes: a schema change, a client restriction, a limit.

1. Change `prisma/schema.prisma` or `src/aventara.config.ts`.
2. For a schema change, run `npx prisma db push` (or your migration workflow), `npx prisma generate` and `npm run aventara:prepare`.
3. Restart or redeploy the server.
4. In the frontend, run `npm run avclient:generate`. The generator fetches `GET <entrypoint>/_contract`, writes the client, and prints `up to date` if nothing changed.
5. Commit the regenerated `src/api/`.

```bash
npm run avclient:generate
# avclient: generated 38 files into ./src/api (checked: syntax).
```

- **Generate against the deployment the client will call.** A client generated against your local server and shipped against production is a different hash unless the two have the same schema and configuration.
- **Order your deploys.** A deployment that changes the contract refuses every old client with `A2005` until those clients are regenerated and redeployed. For web frontends, ship the server and the new client together; for mobile or other long-lived clients, plan how an old build is told to update.
- **Pipelines can change freely.** Authentication and authorization callbacks are not part of the hash, so changing them needs no regeneration.
- **Add it to CI.** Running `avclient generate` against a staging deployment and failing on a diff catches a contract change before it ships.

## See also

- [Contract layers](/docs/contract-layers)
- [Frontend client](/docs/keeping-in-sync)
- [HTTP protocol](/docs/http-protocol#etag-and-304)
- [Troubleshooting](/docs/troubleshooting)
- Guides: [Upgrading](/docs/upgrading), [Deploying](/docs/deploying)
