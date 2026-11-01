import { products } from "./products";
export const AVENTARA_VERSION = products.find(
  (p) => p.id === "framework",
)!.currentVersion;
export const AVENTARA_DIST_TAG = "rc";
