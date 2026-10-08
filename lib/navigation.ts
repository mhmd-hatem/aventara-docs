export type PrimarySection = "overview" | "guides" | "reference";
type NavigationGroup = {
  title: string;
  section: PrimarySection;
  items: [slug: string, title: string, icon: string][];
};

export const navigation: NavigationGroup[] = [
  {
    title: "Start building",
    section: "overview",
    items: [
      ["introduction", "Introduction", "compass"],
      ["why-aventara", "Why Aventara", "compass"],
      ["installation", "Installation", "terminal"],
      ["getting-started", "Quickstart", "terminal"],
      ["existing-project", "Existing project", "folder"],
    ],
  },
  {
    title: "Core concepts",
    section: "overview",
    items: [
      ["concepts", "Core concepts", "layers"],
      ["contract-layers", "Contract layers", "layers"],
      ["resources-and-operations", "Resources & operations", "database"],
      ["results-and-typing", "Results & typing", "code"],
      ["contract-hash", "Contract hash", "shield"],
    ],
  },
  {
    title: "Shaping the API",
    section: "guides",
    items: [
      ["configuration", "Configuration", "settings"],
      ["exposing-and-hiding-fields", "Exposing & hiding fields", "shield"],
      ["restricting-operations", "Restricting operations", "shield"],
      ["computed-fields", "Computed fields", "code"],
      ["enums-and-scalars", "Enums & scalar types", "code"],
      ["json-fields", "JSON fields", "code"],
    ],
  },
  {
    title: "Querying & writing",
    section: "guides",
    items: [
      ["querying", "Querying", "database"],
      ["filtering-sorting-paging", "Filtering, sorting & paging", "settings"],
      ["relations-and-nested-writes", "Relations & nested writes", "workflow"],
      ["counting", "Counting", "database"],
      ["transactions", "Transactions", "workflow"],
      ["transactions-with-ref", "Transactions with $ref", "workflow"],
    ],
  },
  {
    title: "Security & behavior",
    section: "guides",
    items: [
      ["authentication-and-guards", "Authentication & guards", "shield"],
      ["pipelines", "Pipelines", "workflow"],
      ["limits-and-safety", "Limits & safety", "shield"],
      ["request-ids-and-diagnostics", "Request IDs & diagnostics", "life"],
    ],
  },
  {
    title: "Running in production",
    section: "guides",
    items: [
      ["server-side-usage", "Server-side usage", "server"],
      ["deploying", "Deploying", "globe"],
      ["upgrading", "Upgrading", "terminal"],
    ],
  },
  {
    title: "Frontend client",
    section: "guides",
    items: [
      ["frontend-client", "Frontend client", "code"],
      ["client-setup", "Client setup", "terminal"],
      ["typed-calls", "Typed calls", "code"],
      ["client-errors", "Client errors", "life"],
      ["client-options", "Client options", "settings"],
      ["keeping-in-sync", "Keeping in sync", "workflow"],
    ],
  },
  {
    title: "Hosting",
    section: "guides",
    items: [
      ["nestjs-host", "NestJS host", "server"],
      ["express-and-fastify", "Express & Fastify", "server"],
      ["custom-host", "Custom host", "globe"],
      ["testing-and-conformance", "Testing & conformance", "shield"],
    ],
  },
  {
    title: "Examples",
    section: "guides",
    items: [
      ["example-blog-api", "Blog API", "folder"],
      ["example-admin-vs-public", "Admin vs public", "shield"],
      ["example-recipes", "Frontend recipes", "code"],
    ],
  },
  {
    title: "Reference",
    section: "reference",
    items: [
      ["config-reference", "Configuration reference", "settings"],
      ["operations-reference", "Operations reference", "database"],
      ["error-codes", "Error codes", "life"],
      ["http-protocol", "HTTP protocol", "globe"],
      ["protocol-api-reference", "Protocol API", "globe"],
      ["client-api-reference", "Client API", "code"],
      ["nest-api-reference", "NestJS API", "server"],
      ["cli-reference", "CLI reference", "square"],
      ["troubleshooting", "Troubleshooting", "life"],
    ],
  },
  {
    title: "About",
    section: "overview",
    items: [
      ["changelog", "Changelog", "terminal"],
      ["roadmap", "Roadmap", "compass"],
      ["faq", "FAQ", "life"],
      ["glossary", "Glossary", "layers"],
      ["license", "License", "shield"],
    ],
  },
];
export const pages = navigation.flatMap((group) =>
  group.items.map(([slug, title]) => ({
    slug,
    title,
    group: group.title,
    section: group.section,
  })),
);
export function primarySection(pathname: string): PrimarySection {
  return (
    pages.find((page) => pathname === `/docs/${page.slug}`)?.section ??
    "overview"
  );
}
