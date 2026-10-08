# Aventara documentation

A custom documentation site built with Next.js App Router, Fumadocs Core and MDX, Tailwind CSS, and editable shadcn-style Radix components. Uses the Compass Weave logo kit with Moonlit Frost and Aurora Ink themes.

## Develop

Source: [mhmd-hatem/aventara-docs](https://github.com/mhmd-hatem/aventara-docs). Report framework bugs, docs problems, and feature requests through [GitHub Issues](https://github.com/mhmd-hatem/aventara-docs/issues/new/choose).

Use Node.js 24.x and npm for the docs site:

```sh
npm install
npm run dev
```

Open http://localhost:3000. The home route is the product homepage; `/docs/introduction` opens the documentation overview.

```sh
npm run typecheck
npm test
npm run build
npm start
```

If a restricted environment blocks Turbopack’s internal loader port, use `npm run build -- --webpack`; this alternative production build is also verified.

The documentation pages are prerendered. Full-text search uses a Fumadocs server endpoint at `/api/search`, so production currently requires a Next.js server (not a plain static file host).

## Deploy to Vercel

Production: https://aventara-docs.vercel.app — project `aventara-docs` in `razorxxxivs-projects`.

`vercel.json` selects Next.js, installs from the lockfile with `npm ci`, and uses the verified Webpack production build. Node.js is pinned to 24.x in `package.json`. No application environment variables or external database are required; `/api/search` runs as a Next.js server endpoint.

The Vercel project is connected to `mhmd-hatem/aventara-docs`. Pushes to `main` deploy production; pull requests receive preview deployments. Keep the production domain on the existing Vercel project.

For a manual deployment from a linked checkout, use `npx vercel --prod`. The `.vercelignore` allowlist uploads only application source, public assets, numbered docs and build configuration. `.gitignore` also excludes local credentials, build output, source design kits, and internal editorial notes from the public repository.

For a framework release, update the source content and `lib/release.ts` together, run `npm test` and `npm run build -- --webpack`, then push to `main`. Check the resulting deployment's navigation, search and interactive examples before announcing it.

## Analytics

Vercel Web Analytics is mounted in the root layout through `components/site-analytics.tsx`, covering the homepage and documentation. Enable Web Analytics in the Vercel project dashboard before deploying. Development uses the package's debug mode and does not send production analytics.

To exclude your own browser, open `https://aventara-docs.vercel.app/?analytics=off` once. The preference persists in this browser's local storage, and the opt-out visit itself is not recorded. Repeat for each browser or device you use; clearing site data resets the preference. Open `?analytics=on` to resume tracking. If storage is blocked, exclusion lasts only for the current page session.

## Content

The current framework release is `1.0.0-rc.0`. Shared site badges and interactive install commands read the version and `rc` dist-tag from `lib/release.ts`; the numbered source pages contain the release documentation.

Edit the numbered Markdown files in `aventara-docs-content/`. Fumadocs reads those files directly; there is no generated copy to maintain. Numeric prefixes are stripped from page URLs. README and internal site notes are excluded from publishing and search. Navigation groups live in `lib/navigation.ts`.

All 56 pages are arranged in task-focused navigation groups. The current group opens automatically; other groups can be expanded. The same page list drives breadcrumbs, previous/next links, and primary-navigation highlighting. `tests/navigation.test.mjs` checks that every numbered source page appears exactly once.

## Design

- `app/globals.css`: semantic theme tokens, responsive layout, reading styles, and reduced-motion rules.
- `components/docs-shell.tsx`: desktop navigation, mobile drawer, and theme control.
- `app/page.tsx` and `app/landing.css`: the product homepage, with its own navigation, layered model preview, connection flow, playground, and invitation to start building.
- `components/landing-interactions.tsx`: mobile homepage menu, theme control, install command, and synchronized schema/client examples.
- `app/docs/layout.tsx`: the documentation workspace, separate from the homepage.
- `components/overview.tsx`: documentation introduction, examples, and next steps.
- `components/architecture.tsx`: centered Aventara diagram on the homepage, with a replayable schema → contract → API → client flow.
- `components/protocol-flow.tsx`: custom contract/HTTP round-trip illustration with selectable compile, generate, and request stages; `introduction-code.tsx` replaces the source text diagram at render time.
- `app/experience.css`: modern navigation, ambient surfaces, and interactive lab layouts.
- `app/scrollbars.css`: themed native scrollbar variants for the page, navigation, code, tables, and search.
- `app/motion.css` and `components/interaction-motion.tsx`: pointer-origin ripples, sliding selection indicators, page/panel transitions, and theme feedback. Ripples are decorative, ignore disabled controls, and clean up on cancellation or scrolling. Keyboard actions and reduced-motion preferences skip the animation.
- `components/query-playground.tsx`: editable filters, field selection, live sample results, and generated code.
- `components/quickstart-lab.tsx`: four-step setup simulation with project-name and package-manager controls.
- `components/transaction-lab.tsx`: commit and rollback simulation.
- `components/schema-preview.tsx` and `lib/demo-schemas.ts`: copyable Prisma model excerpts, with query selection and transaction constraint explanations. Query and transaction labs expose an ORM Schema tab alongside Preview and Code; setup keeps its schema beside the walkthrough.
- `lib/playground.ts`: deterministic sample query and transaction logic, covered by `tests/playground.test.mjs`.
- `components/ui/`: owned button and dialog primitives; `components.json` configures shadcn.
- `public/branding/`: SVG lockups and favicon assets copied from the supplied kit.
- Fonts are served locally from bundled Manrope and IBM Plex Mono packages.

Search opens with Ctrl/Cmd+K. The search results and code-example tabs support keyboard navigation. Theme preference persists; the initial theme follows the system setting. Transient dialogs handle focus trapping and Escape through Radix.

The overview and querying playground execute local filtering, ordering, limits, and field selection against five sample records. The quickstart and transaction labs simulate setup and database outcomes. Every lab is labeled as a simulation; none installs packages, executes the displayed commands, or connects to a running Aventara API. Reduced-motion preferences remove staged animation delays.

The original palette and logo kits are kept locally; the site assets are in `public/branding/`. See `DESIGN.md` for the accepted design direction.
