import { t } from "../i18n.js?v=1.3.0";

export function requiredElement(selector, root = document) {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(t("app.domMismatch", { selector }));
  }
  return element;
}
