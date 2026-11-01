// Launch indexing on Vercel production; review deployments remain excluded.
export function indexingEnabled(env = process.env) {
  return (
    env.VERCEL_ENV === "production" &&
    (env.AVENTARA_INDEXING === undefined || env.AVENTARA_INDEXING === "enabled")
  );
}
