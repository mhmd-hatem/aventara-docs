---
title: CLI reference
description: Flags, behavior and exit codes of the aventara and avclient commands, and the supported Node versions.
order: 87
section: reference
---

# CLI reference

Two commands: `aventara` scaffolds the server; `avclient` sets up the frontend and generates the typed client. Both are run once through `npx` (or installed globally); neither is a runtime dependency of your application.

The examples use the `@rc` tag, which points to the newest release candidate (`1.0.0-rc.0`).

```bash
npx @aventara/cli@rc <command>        # or: npm i -g @aventara/cli@rc
npx @aventara/client@rc <command>     # in the frontend; after init, `npx avclient <command>`
```

## aventara

```text
aventara new <name> [options]   Create a NestJS project with Aventara (nest new, then init).
aventara init [options]         Add Aventara to the NestJS 12 project in this directory.
aventara --help                 Print usage and exit 0.
aventara <command> --help       Print that command's usage (new, init) and exit 0.
aventara --version, -v          Print this CLI's version and exit 0.
```

### aventara new

Runs the pinned `nest new` (`@nestjs/cli@12.0.8`), then does exactly what `aventara init` does over the new project, installs, and commits. A directory that exists and is not empty is refused before anything runs. A fresh NestJS 12 project is an ES module (`"type": "module"`, `nodenext`), so the files it writes import with `.js`.

The commit is the last step, with the message `Initial Aventara Scaffold`:

```text
aventara: committed the scaffold: "Initial Aventara Scaffold".
```

The run then prints its closing line and, last of all, the next steps ([What it prints next](#what-it-prints-next)), so they are what is on screen when it ends.

It is skipped, with one line saying why and what to do, when `git` is not installed, when git has no `user.name` and `user.email`, when the new project is inside a git repository already, or with `--skip-git` (passed to `nest new`, which then creates no repository). `.env` is not committed: the scaffold's `.gitignore` lists it. The messages:

```text
aventara: no initial commit: /path/to/repo is inside a git repository already; commit the project there.
aventara: no initial commit: git has no user.name and user.email set; set them, then commit the project yourself.
```

### aventara init

Runs inside an existing NestJS 12 project. See [Add to an existing project](/docs/existing-project).

### Flags

| Flag | Applies to | Meaning | Default |
|---|---|---|---|
| `<name>` | `new` | The project directory. | required |
| `--orm <adapter>` | both | The ORM, as an adapter name (`prisma7`; `aventara --help` lists the choices). `prisma` and `prisma@7` are refused. | the only one there is |
| `--db <provider>` | both | `sqlite` or `postgresql`. | `sqlite` |
| `--package-manager <npm\|pnpm>` | both | | the lockfile's, else the one that launched the CLI, else npm |
| `--prisma-service <path#Export>` | `init` | Your Prisma service (`src/prisma.service.ts#PrismaService`), when more than one or none is found. | the one found; none found: writes `src/prisma.service.ts` |
| `--prisma-module <path#Export>` | `init` | The Nest module that provides and exports it. | the one found |
| `--skip-install` | both | Write the files and print the install command instead of running it. | |
| `--skip-git` | `new` | Create no repository and make no initial commit (passed to `nest new`). | |
| `-y`, `--yes` | both | Accept every unanswered default and replace existing content that differs. | |
| `--verbose` | both | Show the output of `nest new` and of the install as it runs, instead of only when one fails. | |

On a terminal, unanswered questions are asked. Anywhere else (CI, a script), pass the flags or `--yes`, or the run stops in one sentence naming what is missing, before writing anything. A question with only one possible answer is shown, not asked.

Existing content that differs from what would be written (a `.env` key, a script, a file) is listed and replaced only when you confirm, or with `--yes`; where nobody can be asked, the run stops and touches nothing. `aventara` never overwrites your ORM files and never touches a database.

### Refusals

Each is one sentence on stderr, exit code 1, and nothing is written. The messages:

```text
aventara: unknown command "bogus": the commands are new and init; run `aventara --help` for usage.
aventara: there is no Aventara adapter for the ORM "prisma@7"; --orm takes prisma7 (Prisma 7, @aventara/prisma7-adapter).
aventara: the Prisma 7 adapter does not support the database "mysql"; choose sqlite or postgresql.
aventara: "yarn" is not a supported package manager; choose npm or pnpm.
aventara: stdin is not a terminal, so nothing can be asked: pass <name>, --db <sqlite|postgresql> and --package-manager <npm|pnpm>, or pass --yes to accept the defaults for --db and --package-manager.
aventara: aventara init runs in a NestJS 12 project, and there is no package.json in /path/to/dir.
aventara: this project is already initialized: src/app.module.ts uses AventaraModule.
```

`aventara init` is also refused for another Nest major, TypeScript 7, a yarn-only lockfile, or an installed Prisma outside `^7.10.0`.

### What it writes

For a project with no ORM yet: `prisma/schema.prisma` (a `User` model), `prisma.config.ts`, `src/prisma.service.ts`, `src/aventara.config.ts`, one edit each to `src/app.module.ts`, `src/main.ts` and `test/app.e2e-spec.ts`, `.env` (`DATABASE_URL` and `CORS_ORIGINS`), `.gitignore` (which lists `.env`, `/src/generated/` and the SQLite files), and `package.json` (the `@aventara/*` packages at the CLI's version, Prisma and the driver at `7.10.0`, the `aventara:prepare` and `postinstall` scripts, and `prebuild`, `prestart`, `prestart:dev` and `prestart:debug` scripts that run `aventara:prepare` so building or starting regenerates the discovery artifact first). The generated `src/generated/**` is rebuilt by `aventara:prepare` and is never edited. With Prisma already present your schema, Prisma config and service are reused and never written, and `.env` only gets the `CORS_ORIGINS` line appended.

The `src/main.ts` edit enables CORS for the origins in `CORS_ORIGINS` (default `http://localhost:5173,http://localhost:3001`; unset or empty means CORS off) and adds a commented-out platform rate limiter. If `main.ts` already configures CORS it is left alone, and if it has no `const app = await NestFactory.create(...)` line, the lines are printed instead ([Add to an existing project](/docs/existing-project#what-it-changes-in-maints-and-env)). See [Rate limiting](/docs/limits-and-safety#rate-limiting).

### Progress (aventara)

While it works, `aventara new` and `aventara init` show each step on stderr, so a long install never looks hung. A real run of `aventara new`, with stderr and stdout kept apart:

```text
[1/4] Creating the NestJS project (npx -y @nestjs/cli@12.0.8 new blog)… done (11.4s)
[2/4] Writing Aventara's files… done (0.0s)
[3/4] Installing dependencies (npm install)… done (1m 42s)
[4/4] Committing the scaffold… done (0.0s)
aventara: created blog in 1m 53s.
```

- On a terminal, the current step shows a spinner and the seconds so far, then `✓` or `✗` and its time.
- In a pipe, in CI (`CI` is set) or with `NO_COLOR`, each step is one plain line, `… done (12.4s)`, with no control sequences, as above.
- The output of `nest new` and of the install is shown only when one of them fails, or as it runs with `--verbose`.
- A closing line gives the total time. Results and the next steps go to stdout.

### What it prints next

The next steps are the last thing printed, after the commit line and the closing line, on a terminal and in a pipe alike:

```text
Next:
  1. Enter the project: cd blog
  2. Create the database tables: npx prisma db push
  3. Start the server: npm run start:dev
  4. In your frontend: npx @aventara/client@rc init
```

With `--skip-install` there is one more step, `Install, which also runs aventara:prepare: npm install`, after entering the project. Under pnpm the commands read `pnpm exec prisma db push` and `pnpm dlx @aventara/client@rc init`.

The runner (`npx` or `pnpm dlx`) matches your package manager. The server answers `GET http://localhost:3000/api/_contract` once it runs. With PostgreSQL, set `DATABASE_URL` in `.env` first. `init` writes Prisma's placeholder and never asks for a secret.

## avclient

```text
avclient init [options]     Set up this frontend: framework.client.ts, the .env entry, the
                            avclient:generate script and the @aventara/client devDependency;
                            install; generate.
avclient generate [--yes]   Read framework.client.ts (or .js, .mjs, .cjs, .mts, .cts), fetch
                            <entrypoint>/_contract, and write AvClient.ts and generated/ into
                            generateAt, its imports spelled as the project's tsconfig.json says.
avclient --help             Print usage and exit 0.
avclient <command> --help   Print that command's usage (init, generate) and exit 0.
avclient --version, -v      Print this generator's version and exit 0.
```

### avclient init

| Flag | Meaning | Default |
|---|---|---|
| `--entrypoint <url>` | The server's entrypoint. | `http://localhost:3000/api` |
| `--env-var <NAME>` | Read the entrypoint from this variable. | `AVENTARA_API_URL` |
| `--no-env-var` | Write the entrypoint into `framework.client.ts` as a literal. | |
| `--generate-at <dir>` | Where the client goes. | `./src/api` |
| `--package-manager <npm\|pnpm>` | | the lockfile's, else the launching one, else npm |
| `--skip-install` | Print the install instead of running it. | |
| `--skip-generate` | Do not generate now. | |
| `-y`, `--yes` | Accept every default and replace differing content. | |

It first checks that the project has a `tsconfig.json`: a plain JavaScript project is refused before anything is written ([Troubleshooting](/docs/troubleshooting#avclient-init-refuses-no-tsconfigjson)). Then it writes `framework.client.ts`, the variable into `.env` (only with an env var), the script, an exact devDependency on `@aventara/client`, and `.env` in the frontend's `.gitignore`, installs, then generates, type-checking the output with the project's own TypeScript. A `framework.client.mts` from `0.1.0-pilot.1` is kept and keeps working. The config may be `.ts`, `.mts`, `.cts`, `.js`, `.mjs` or `.cjs`, in ESM or CommonJS syntax. If the server is not answering, the files are left in place and the message tells you to run `avclient generate` later.

### Environment

`avclient` reads the `.env` cascade from the current directory before evaluating `framework.client.ts`, highest precedence first: the process environment, `.env.<mode>.local`, `.env.<mode>`, `.env.local`, `.env`. `mode` is `NODE_ENV`, or `development`.

### Progress (avclient)

`avclient init` and `avclient generate` show their steps the same way (on stderr, with a spinner on a terminal and one plain line per step in a pipe, in CI or with `NO_COLOR`), then a closing line with the total time. `avclient` has no `--verbose` flag. A real `avclient init` run:

```text
[1/6] Writing the client setup… done (0.0s)
[2/6] Installing dependencies (npm install)… done (0.8s)
[3/6] Loading the client config… done (0.1s)
[4/6] Fetching the ClientContract (http://localhost:3000/api/_contract)… done (0.0s)
[5/6] Emitting the client… done (0.0s)
[6/6] Checking and writing the client into src/api… done (0.6s)
avclient: done in 1.6s.
avclient: generated 39 files into /path/to/project/src/api (checked: types).
```

When nothing changed, `avclient generate` ends with `avclient: up to date: … already holds this deployment's client; nothing was written.`

### avclient generate

`avclient generate` takes only `--yes`; everything else it needs is in `framework.client.ts` ([Frontend client](/docs/frontend-client)). `--yes` overwrites or removes content in `AvClient.ts` or `generated/` that the generator did not produce, without asking. Without it such content is listed and you are asked; with no terminal (CI) the run is refused and nothing is touched.

### Refusals and errors

The messages:

```text
avclient: no tsconfig.json was found in /path/to/project/src/api or any directory above it. ... JavaScript projects are not supported yet. ... Nothing was written.
avclient: framework.client.ts and framework.client.cjs are both in /path/to/project, and only one may configure the generator; keep one and delete the other.
avclient: Could not fetch the ClientContract from http://localhost:3999/api/_contract: fetch failed (connect ECONNREFUSED 127.0.0.1:3999). Check that the deployment is running and that the entrypoint is its origin plus mount path.
avclient: entrypoint must use http: or https:, not ftp:
avclient: entrypoint must not carry credentials: ...
avclient: entrypoint reads AVENTARA_API_URL, which is not set in the process environment or in any of .env.development.local, .env.development, .env.local, .env (mode "development").
```


## aventara-prisma7-generate

The bin of `@aventara/prisma7-adapter`, run by the scaffold's `aventara:prepare` script. Flags `--schema`, `--client`, `--provider`, `--driver`, `--out`, `-h`/`--help`; see [Configuration reference](/docs/config-reference#aventara-prisma7-generate).

## Exit codes

| Code | Meaning |
|---|---|
| `0` | Success, including `avclient: up to date` and `--help`. |
| `1` | Failure (including an unknown command or flag): a refusal, a cancelled or refused prompt, an unsupported Node, a server that did not answer, an invalid contract. Failures are one sentence with no stack trace. |

A stack trace means a defect in the tool; please report it.

## Supported environments

| | |
|---|---|
| Node.js | `^22.18.0 \|\| >=24.2.0`. On any other version the bin refuses in one sentence naming this range. On Node 22 use npm 11 or newer. |
| Package managers | npm, pnpm. Yarn is not supported. |
| Projects | NestJS 12 (a fresh one is ESM), ESM or CommonJS. `avclient`: any TypeScript project (a `tsconfig.json`); plain JavaScript is not supported yet. |
| ORM | Prisma 7 (`^7.10.0`): SQLite and PostgreSQL. |
| TypeScript | `avclient`: `>=5.5.0`, including 7 (under 7 the post-generate check degrades to a syntax and shape check with a warning). `aventara` and the Prisma adapter: `<7` (the scaffolded server uses 6). |

See also: [Upgrading](/docs/upgrading), [Deploying](/docs/deploying).
