# Aventara unified site

One Next.js app for the Aventara homepage and product documentation. Built with Fumadocs Core/MDX, Tailwind, and owned Radix components.

## Routes and publication

The intended canonical host is **https://aventara.razor34.dev**:

- `/`: shared homepage.
- `/framework` and `/access`: product landing pages.
- `/<product>/docs/<slug>`: documentation, keeping existing slugs and heading anchors.
- `/<product>/api/search`: search scoped to that product.
- `/<product>/llms.txt`, `/<product>/llms-full.txt`, and `/<product>/markdown/<slug>`: generated Markdown exports.

The old `aventara-framework.vercel.app` and `aventara-docs.vercel.app` hosts redirect permanently to the canonical host with `/framework` prepended to the original path. Browsers retain URL fragments. `/docs/...` on the canonical host also redirects to Framework. Root `/llms.txt` lists both products; the legacy full export redirects to Framework.

This work is on `codex/unified-docs`. Building this branch does not launch it. Keep production unchanged until the new host and build content sources are ready.

Feedback continues through [the public docs repository's issues](https://github.com/mhmd-hatem/aventara-docs/issues/new/choose); the product repositories are private.

## Local development

Use Node.js 24.x and npm:

```sh
npm install
npm run dev -- --webpack
```

The default content sources are live folders:

- Framework: `./aventara-docs-content/`
- Access: `./aventara-access-docs-content/`

Override these with `AVENTARA_FRAMEWORK_CONTENT` and `AVENTARA_ACCESS_CONTENT` when checkouts live elsewhere. Both folders must exist before installing/building. The app reads them directly; it does not maintain copies of their Markdown.

```sh
npm test
npm run build -- --webpack
npm run verify:build
npm run typecheck
```

Webpack supports the external content directories and is also the configured Vercel build. Search requires a Next.js server; this is not a static export.

`content:prepare` runs before development, build and tests. It creates ignored collection configuration and public metadata under `.generated/`; Fumadocs compiles the original Markdown. After adding/removing files or changing the registry, restart development to regenerate collections.

## Products and content sources

`content/products.json` owns each product's identity, current version, version source entries, navigation, landing copy, logo, and optional theme tokens. Add a product entry and numbered Markdown content to obtain its landing page, docs, switcher entry, search and exports without adding routes or components. Every source page must appear exactly once in navigation or `topPages`; preparation validates this.

Required fields are `id`, `name`, `description`, `currentVersion`, `versions`, and `navigation`. Navigation groups contain `title`, `section`, and `items` tuples of `[slug, title, icon]`. Page titles come from source frontmatter. Optional `overviewSlug` and `startSlug` override introduction/quickstart defaults; otherwise they fall back to the first published page. Landing copy, features, install commands, primary navigation, logo and themes have defaults. Framework's AI guide is configured in top navigation rather than the sidebar.

Currently one selected version is served per product. The registry stores version/source pairs so more refs can be added later; a multi-version reader is not implemented yet.

When content moves to each product repository's `docs/`, replace its local source with a GitHub source:

```json
{
  "kind": "github",
  "repo": "mhmd-hatem/Aventara-Framework",
  "ref": "<published-tag-or-branch>",
  "path": "docs",
  "tokenEnv": "AVENTARA_CONTENT_TOKEN"
}
```

Access's repository is `mhmd-hatem/Aventara-Access`. Both repositories were verified private. Supply a read-only build token as an environment secret; never put it in the registry. The adapter fetches numbered Markdown into temporary build storage and never serializes credentials or source paths into the public product metadata. It refreshes moving refs every build. Local and GitHub adapters share the same interface.

Both content folders are now versioned in this repository and included in cloud build inputs. The framework content branch and Access content branch are merged into `codex/unified-docs`. When moving content to product repositories, configure an existing ref and supply a read-only token for private content.

## Drafts and indexing

Pages carrying a `<!-- DRAFT ... -->` marker or listed in a product’s `unpublishedPages` are excluded from MDX collections, search, raw Markdown and full exports. Existing links to these pages show a neutral review notice with preserved heading IDs. The Framework policies page is explicitly held in `unpublishedPages` until maintainer approval, even if its source draft marker is removed; its draft body is not published. README and `_site-notes.md` are never published.

Crawler indexing remains blocked by `robots.txt` and `X-Robots-Tag`. The agreed enablement point is the **rc.11 launch**: set `AVENTARA_INDEXING=enabled` on the production deployment then, keeping previews blocked. Draft holding pages retain their own noindex metadata. Crawler directives are not access control.

Deploy only after the architect gives the launch go-ahead. Before launch:

1. Recheck npm releases and update `currentVersion` plus its matching version entry in the registry. The site is prepared for Framework `1.0.0-rc.12` and Access `1.0.0-rc.2` as requested in the 31 October handoff. At integration time npm still had Framework rc.11 and Access rc.1; confirm the target releases are published before launch.
2. Pull any final content commits from both release content branches. Both sources are available in this repository for cloud builds.
3. Run tests, the production build, and built-output verification.
4. Attach `aventara.razor34.dev` to the existing Vercel project before deploying the old-host redirects. Check redirects and fragments on the deployed hosts.
5. Review both products on mobile and desktop in both themes, then enable production indexing at launch.

## Design and analytics

Framework retains Moonlit Frost / Aurora Ink. Access uses a green palette derived from its approved logo, including navigation, selected states, links, controls, search dialogs and mobile navigation. Product tokens live in the registry; shared presentation is in `app/unified.css`. `DESIGN.md` records design decisions and logo assets.

Vercel Web Analytics respects the existing opt-out. Open `/?analytics=off` once on the site to exclude this browser; `?analytics=on` resumes recording. The preference is specific to each hostname/browser. Development does not send production analytics.
