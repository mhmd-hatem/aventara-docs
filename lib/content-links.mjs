const oldHosts = new Set([
  "aventara-framework.vercel.app",
  "aventara-docs.vercel.app",
]);
export function productLink(href, product) {
  if (!href) return href;
  if (/^https?:\/\//.test(href)) {
    const url = new URL(href);
    if (oldHosts.has(url.hostname))
      return `/framework${url.pathname === "/" ? "" : url.pathname}${url.search}${url.hash}`;
    if (url.hostname === "aventara.razor34.dev")
      return `${url.pathname}${url.search}${url.hash}`;
    return href;
  }
  if (
    /^\/docs(?:\/|$|[?#])/.test(href) ||
    /^\/llms(?:-full)?\.txt(?:$|[?#])/.test(href)
  )
    return `/${product}${href}`;
  return href;
}
export function remarkProductLinks({ product }) {
  return (tree) => {
    const visit = (node) => {
      if (
        (node.type === "link" ||
          node.type === "definition" ||
          node.type === "image") &&
        node.url
      )
        node.url = productLink(node.url, product);
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
