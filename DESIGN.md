# Aventara documentation design decisions

## Confirmed palette selection

Selected by the user on 6 October 2026:

- Dark mode: **Aurora Ink** (`aurora-ink`).
- Light mode: **Moonlit Frost** (`moonlit-frost`).

The Caligo palette tokens below are the baseline. The implemented theme definitions live in `app/globals.css`; the original design kit is kept locally. Rose & Mint and Violet Frost were explored but are not the selected pair.

| Role             | Aurora Ink, dark | Moonlit Frost, light |
| ---------------- | ---------------- | -------------------- |
| Background       | `#111823`        | `#ECEEF7`            |
| Surface          | `#192333`        | `#F8F9FD`            |
| Raised surface   | `#223044`        | `#E3E6F3`            |
| Main text        | `#E5EDF5`        | `#25223B`            |
| Secondary text   | `#AFBDCF`        | `#635F7B`            |
| Brand pigment    | `#393078`        | `#393078`            |
| Primary action   | `#A69DE7`        | `#393078`            |
| Text on primary  | `#151322`        | `#F8F7FC`            |
| Secondary accent | `#92AEDD`        | `#504B77`            |
| Accent           | `#89C4CD`        | `#443894`            |
| Selected surface | `#36405C`        | `#CACBE1`            |
| Selected text    | `#AFA7E9`        | `#393078`            |
| Focus            | `#A69DE7`        | `#393078`            |

The later interactive preview explored modified dark surfaces under the label “Aurora / Ink.” Those exploratory overrides are distinct from the original palette tokens above. Palette selection does not finalize every layout or surface treatment in the previews.

## Established direction

- Next.js with Fumadocs Core and Fumadocs MDX.
- Custom interface built with shadcn/ui and Tailwind CSS.
- Fluent-inspired layering, soft depth, carefully placed translucent menus, and purposeful CSS animation.
- Distinctive visual identity with comfortable technical reading and clear navigation.
- Existing Markdown in `aventara-docs-content/` remains the source material.

## Implementation guidance

Keep the brand pigment separate from the accessible primary-action color, especially in dark mode. Preserve the defined foreground/background pairings. Reserve status colors for their semantic roles. Recheck contrast if colors, opacity, gradients, or material treatments change.

Use CSS transitions for interface feedback and explicit animations for explanatory diagrams. Respect reduced-motion preferences. The implemented interface uses larger editorial headings, open navigation, rounded panels, and subtle ambient color, with the interactive examples doing the explanatory work.

## Interactive implementation

The site uses Compass Weave horizontal branding in the header and its standalone mark at the center of the homepage flow diagram. Manrope is the UI and reading face; IBM Plex Mono is used for code and technical annotations. Fonts are bundled locally.

The homepage pairs its introduction with the restored four-stage connected-stack diagram, framing Aventara at the center. A user-triggered trace illuminates schema, contract, API, and client in order; keyboard and reduced-motion activation show the completed flow immediately.

Following the user's HeroUI v2 reference, examples now pair interactive previews with code. The overview and querying guide include a query playground with filters, field selection, ordering, limits, local sample results, and a staged request journey. The quickstart includes a four-step simulated terminal walkthrough. Transactions demonstrate both a successful commit and rollback after a duplicate-email error. These are clearly labeled local simulations, not a live Aventara runtime.

Query and transaction simulations expose an ORM Schema tab beside Preview and Code, with syntax highlighting and a copy control. Query selections are echoed beside the fixed User schema; transaction explanations connect the active scenario to the unique-email constraint or User/Post relation. Setup keeps the starter User model visible below its walkthrough. All three example tabs support wrapping arrow-key navigation and Home/End.

The introduction’s portable text diagram is rendered as a custom round-trip illustration: layered source files, an Aventara compile seal, contracts, and connected host/client panels. Compile, Generate, and Request controls highlight the corresponding layers and explain the path without autoplay.

The documentation workspace retains grouped collapsible navigation, full-text search, themed syntax highlighting, copy controls, desktop table of contents, and a mobile drawer. The original selected palette tokens remain the baseline; derived translucent borders and ambient surfaces soften the interface. Motion responds to user actions: low-opacity pointer-origin ink ripples expand over 480ms, capped to the control’s shorter dimension; main actions use 16px horizontal and 8px vertical padding; selected surfaces slide beneath preview/code and package-manager labels; pages, setup steps, and dialogs have gentle ease-out entrance/exit transitions. Hover lift is limited to precise pointers. Theme surfaces transition smoothly. Keyboard actions and reduced-motion preferences skip simulation delays and positional animation.

All 54 numbered source pages are integrated directly through Fumadocs MDX. Task-focused groups split the larger guide collection into shaping the API, querying and writing, security and behavior, and running in production. The active navigation group opens automatically, and the pane keeps the active page visible without moving the article. The internal site notes and source README are not public pages. The public site is hosted at https://aventara-docs.vercel.app.

## Interaction consistency

Motion is centralized in `app/motion.css`: 100ms press feedback, 180ms color feedback, 220ms surface changes, 240ms travel, 260ms entrances, and 160ms exits, all eased out. Navigation stays stationary on hover; only directional arrows move. Mouse movement restores hover transitions after keyboard use. Main-button padding remains 16px × 8px.

The page, sidebar/TOC, code blocks, data tables, and search results use distinct themed native scrollbar weights and colors. Native wheel, touch, and keyboard scrolling remain intact; high-contrast mode uses system colors.
