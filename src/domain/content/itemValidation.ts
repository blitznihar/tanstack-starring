import { richToText } from "~/lib/richText.js";
import type { Item } from "~/schemas/item.js";

const PLACE_NAMES = ["ones", "tens", "hundreds", "thousands", "ten thousands", "hundred thousands", "millions"];

function optionNumber(text: string): number | null {
  const cleaned = text.replace(/,/g, "").trim();
  if (!/^\d+$/.test(cleaned)) return null;
  return Number(cleaned);
}

function placeValueParts(value: string): Set<number> {
  const digits = value.replace(/\D/g, "");
  const parts = new Set<number>();
  for (let index = 0; index < digits.length; index++) {
    const digit = Number(digits[index]);
    if (digit === 0) continue;
    parts.add(digit * 10 ** (digits.length - index - 1));
  }
  return parts;
}

function containsPlaceClarifier(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return PLACE_NAMES.some((place) => lower.includes(place)) || /\bplace\b/.test(lower);
}

function valuePromptAmbiguity(prompt: string): string | null {
  const match = prompt.match(/value of the\s+(\d)\s+in\s+([\d,]+)/i);
  if (!match) return null;
  const digit = match[1]!;
  const number = match[2]!.replace(/\D/g, "");
  const occurrences = [...number].filter((char) => char === digit).length;
  if (occurrences > 1 && !containsPlaceClarifier(prompt)) {
    return `value prompt for ${match[2]} has more than one ${digit}; name the place being asked about`;
  }
  return null;
}

function expandedFormIssues(item: Item, prompt: string): string[] {
  if (!/expanded[- ]form/i.test(prompt) || !item.options?.length) return [];
  const match = prompt.match(/(?:of|for)\s+([\d,]+)/i);
  if (!match) return [];
  const parts = placeValueParts(match[1]!);
  const issues: string[] = [];
  for (const option of item.options) {
    const value = optionNumber(option.text);
    if (value == null) continue;
    const isPart = parts.has(value);
    if (isPart && !option.correct) issues.push(`option ${option.key} (${option.text}) is a valid expanded-form part but is not marked correct`);
    if (!isPart && option.correct) issues.push(`option ${option.key} (${option.text}) is marked correct but is not an expanded-form part`);
  }
  return issues;
}

export function validateItemAuthoring(item: Item): string[] {
  const prompt = richToText(item.prompt);
  const lower = prompt.toLowerCase();
  const issues: string[] = [];
  const correctOptions = (item.options ?? []).filter((option) => option.correct);

  if (item.type === "multiple_choice" && (item.options?.length ?? 0) > 0 && correctOptions.length !== 1) {
    issues.push(`multiple-choice item must have exactly 1 correct option; found ${correctOptions.length}`);
  }

  if (item.type === "multiselect") {
    if (correctOptions.length === 0) issues.push("multiselect item must have at least 1 correct option");
    if (lower.includes("select two") && correctOptions.length !== 2) {
      issues.push(`prompt says Select TWO but has ${correctOptions.length} correct options`);
    }
  } else if (lower.includes("select two") || lower.includes("select all")) {
    issues.push(`prompt says ${lower.includes("select two") ? "Select TWO" : "Select ALL"} but item type is ${item.type}`);
  }

  const ambiguity = valuePromptAmbiguity(prompt);
  if (ambiguity) issues.push(ambiguity);
  issues.push(...expandedFormIssues(item, prompt));
  return issues;
}
