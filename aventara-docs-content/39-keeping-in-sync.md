---
title: Keeping in sync
description: Regenerate the client when the server changes - what triggers it, the up-to-date check, running it in CI, and how a stale client behaves.
order: 55
section: frontend
---

# Keeping in sync

A generated client is a snapshot of your server's client contract. When the contract changes, the snapshot goes stale; regenerating it is one command, and the server tells you when you forgot.

## What makes a client stale

The client is bound to the **hash of the whole contract** the deployment advertises, not only your schema. Regenerate after any of:

- a schema change (a new model, field or enum value),
- a change to `client` restrictions, limits or operations in your configuration,
- transactions switched on or off for the client layer.

Changes that stay on the server (a pipeline guard, the application layer's configuration, a bug fix) do not change the contract.

## Regenerate

With the server running:

```bash
npm run avclient:generate      # same as: npx avclient generate [--yes]
```

The generator fetches `<entrypoint>/_contract`, verifies it, and writes `AvClient.ts` and `generated/` into `generateAt`. A failed run leaves the previous output exactly as it was. Commit the result, never edit it.

## Up to date

A rerun asks the server conditionally (`If-None-Match` with the hash of the output it finds). When nothing changed, the server answers `304 Not Modified`, and nothing is written:

```text
avclient: up to date: /path/to/src/api already holds this deployment's client; nothing was written.
```

You can see the mechanism with curl: the contract carries its hash as an `ETag`.

```bash
curl -si http://localhost:3103/api/_contract | head -5
# ETag: "sha256:f9a5230f..."

curl -si http://localhost:3103/api/_contract -H 'If-None-Match: "sha256:f9a5230f..."' | head -1
# HTTP/1.1 304 Not Modified
```

If the contract is unchanged but the generator or the entrypoint changed, the output is rewritten and the message says so.

## What a stale client does

Every request carries the contract hash and protocol version. If they do not match the server, the server answers `409 A2005` and the client throws `ContractMismatchError`:

```ts
try {
  await avClient.User.find.many({});
} catch (e) {
  // e instanceof ContractMismatchError, e.code === "A2005"
  // e.cause.message: "Generated client contract does not match the server. Regenerate the client."
}
```

It happens before anything runs, so nothing is half-applied. This includes calling an operation the server no longer advertises. A response that is not an Aventara envelope at all (a host's own 404, a proxy error) is a `TransportError` instead: nothing in it says the client is stale.

Two deployments of one schema can advertise different contracts (different restrictions, different limits). A client generated against one is refused by the other, so **generate against the deployment the client will call**. In practice: generate against the environment you deploy to, or make sure every environment runs the same configuration.

## Generating in CI

Generate against the deployment the build will call and fail the build if the committed output differs:

```bash
npm run avclient:generate -- --yes
git diff --exit-code src/api
```

`--yes` also answers the prompts, which matter because in CI nobody can: where there is no terminal and the generator would have to ask (for example, `AvClient.ts` or `generated/` contains something it did not produce), the run is refused and nothing is touched.

To use one config for local and CI, read the entrypoint from the environment (`env("AVENTARA_API_URL")`, see [Client setup](/docs/client-setup#environment-variable-or-literal)) and set the variable in the CI job.

## Content the generator did not produce

If `AvClient.ts` or `generated/` holds something the generator did not write, it is listed and you are asked before it is overwritten. `--yes` answers yes. Anything else in `generateAt` is never touched.

## A workflow that works

1. Change the schema or restrictions on the server; `prisma db push` / `npm run aventara:prepare`; restart.
2. `npm run avclient:generate` in the frontend.
3. Fix the type errors the compiler now reports: they are exactly what changed in the contract.
4. Commit the server change and the regenerated client together.

## See also

- [Client setup](/docs/client-setup)
- [Client errors](/docs/client-errors#contractmismatcherror)
- [Contract hash](/docs/contract-hash)
- [CLI reference](/docs/cli-reference)
- Guides: [Deploying](/docs/deploying), [Upgrading](/docs/upgrading)
