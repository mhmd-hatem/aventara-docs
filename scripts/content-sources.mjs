import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";

// Both adapters return a directory; local sources are never copied or modified.
export async function resolveContentSource(
  source,
  { root = process.cwd(), fetcher = fetch, env = process.env } = {},
) {
  if (source.kind === "local") {
    const dir = resolve(root, (source.env && env[source.env]) || source.path);
    try {
      await access(dir);
    } catch {
      throw new Error(
        `Content source unavailable: ${dir}. Set ${source.env || "the product source path"} or configure a GitHub repo/ref/path source.`,
      );
    }
    return dir;
  }
  if (source.kind !== "github")
    throw new Error(`Unsupported content source: ${source.kind}`);
  if (!/^[\w.-]+\/[\w.-]+$/.test(source.repo) || !source.ref || !source.path)
    throw new Error("GitHub sources require repo, ref and path.");
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = env[source.tokenEnv || "GITHUB_TOKEN"];
  if (token) headers.Authorization = `Bearer ${token}`;
  const endpoint = `https://api.github.com/repos/${source.repo}/contents/${source.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(source.ref)}`;
  const response = await fetcher(endpoint, { headers });
  if (!response.ok)
    throw new Error(
      `Cannot read ${source.repo}@${source.ref}/${source.path}: HTTP ${response.status}`,
    );
  const entries = await response.json();
  if (!Array.isArray(entries))
    throw new Error("Content source path must be a directory.");
  const key = createHash("sha256")
    .update(JSON.stringify(source))
    .digest("hex")
    .slice(0, 16);
  // Fetch fresh listings on every build, even for moving branch refs.
  const dir = join(
    tmpdir(),
    "aventara-docs-content",
    key,
    Date.now().toString(),
  );
  await mkdir(dir, { recursive: true });
  for (const entry of entries.filter(
    (e) => e.type === "file" && /^\d+-[^/]+\.md$/.test(e.name),
  )) {
    const url = `${endpoint.split("?")[0]}/${encodeURIComponent(entry.name)}?ref=${encodeURIComponent(source.ref)}`;
    const res = await fetcher(url, {
      headers: { ...headers, Accept: "application/vnd.github.raw+json" },
    });
    if (!res.ok)
      throw new Error(`Cannot read ${entry.name}: HTTP ${res.status}`);
    await writeFile(join(dir, entry.name), await res.text());
  }
  return dir;
}
export async function readContentFiles(dir) {
  const names = (await readdir(dir))
    .filter((name) => /^\d+-.+\.md$/.test(name))
    .sort();
  if (!names.length) throw new Error(`No numbered Markdown pages in ${dir}`);
  return Promise.all(
    names.map(async (name) => ({
      name,
      raw: await readFile(join(dir, name), "utf8"),
    })),
  );
}
