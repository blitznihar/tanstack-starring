import type { RichContent } from "~/schemas/common.js";

/** Flatten RichContent to a plain-text string (for stems, search, prompt embeds). */
export function richToText(content: RichContent | undefined): string {
  if (!content) return "";
  return content
    .map((node) => {
      if (typeof node === "string") return node;
      if (node.text) return node.text;
      if (node.items) return node.items.join(" ");
      return "";
    })
    .filter(Boolean)
    .join(" ")
    .trim();
}
