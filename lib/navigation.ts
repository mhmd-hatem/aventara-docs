// Compatibility exports for framework-specific simulations.
import {
  getProduct,
  productPages,
  primarySection as section,
} from "./products";
const framework = getProduct("framework")!;
export const navigation = framework.navigation;
export const primaryNavigation = framework.primaryNavigation;
export const pages = productPages(framework);
export function primarySection(pathname: string) {
  return section(framework, pathname.replace(/^\/docs/, "/framework/docs"));
}
