import { dmrReplySchema } from "~/schemas/scoringJob.js";

/**
 * PURE, defensive parser for the local model's reply (§8). The model is asked to
 * reply with STRICT JSON `{score, justification, tips}`, but small local models
 * often wrap it in ```json fences, add a sentence before/after, or emit a
 * reasoning/draft object BEFORE the real answer. We extract EVERY balanced
 * top-level object, validate each against the reply schema, and accept iff
 * exactly one validates — clamping the score into [0, maxPoints] and normalizing
 * tips. Zero valid objects, or more than one (we can't know which is
 * authoritative), → `ok:false`, which routes the job to the manual queue. The
 * contract is: never a wrong silent score; when in doubt, a human scores it.
 */

export type AiScoreResult =
  | { ok: true; score: number; justification: string; tips: string[] }
  | { ok: false; error: string };

/**
 * Find ALL balanced top-level {...} objects in arbitrary text (handles fences,
 * prose, and braces inside strings). A truncated/unbalanced trailing object is
 * dropped (we stop at the first object that never closes).
 */
export function extractJsonObjects(text: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = text.indexOf("{", from);
    if (start === -1) break;
    let depth = 0;
    let inString = false;
    let escaped = false;
    let end = -1;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end === -1) break; // unbalanced (e.g. truncated reply) — stop scanning
    out.push(text.slice(start, end + 1));
    from = end + 1;
  }
  return out;
}

/** The first balanced {...} object, or null. (Convenience over `extractJsonObjects`.) */
export function extractJsonObject(text: string): string | null {
  return extractJsonObjects(text)[0] ?? null;
}

function clampScore(raw: number, maxPoints: number): number {
  if (!Number.isFinite(raw)) return 0;
  const half = Math.round(raw * 2) / 2; // allow half-credit, keep it clean
  return Math.max(0, Math.min(maxPoints, half));
}

function normalizeTips(tips: unknown): string[] {
  if (Array.isArray(tips)) return tips.map((t) => String(t).trim()).filter(Boolean).slice(0, 5);
  if (typeof tips === "string") {
    return tips
      .split(/\n|•|;|(?<=\.)\s+(?=[A-Z])/)
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 5);
  }
  return [];
}

export function parseDmrReply(raw: string, maxPoints: number): AiScoreResult {
  if (typeof raw !== "string" || raw.trim() === "") return { ok: false, error: "empty reply" };
  const candidates = extractJsonObjects(raw);
  if (candidates.length === 0) return { ok: false, error: "no JSON object found in reply" };

  // Validate EVERY balanced object — a chatty/reasoning model frequently emits a
  // scratch or draft object before the real answer. Accept iff EXACTLY ONE object
  // validates. If several validate we cannot know which is authoritative, so we
  // route to manual rather than guessing (§8: never a wrong silent score).
  const valid: { score: number; justification: string; tips: string[] }[] = [];
  for (const json of candidates) {
    let obj: unknown;
    try {
      obj = JSON.parse(json);
    } catch {
      continue;
    }
    const parsed = dmrReplySchema.safeParse(obj);
    if (parsed.success) {
      valid.push({
        score: clampScore(parsed.data.score, maxPoints),
        justification: parsed.data.justification.trim(),
        tips: normalizeTips(parsed.data.tips),
      });
    }
  }

  if (valid.length === 0) return { ok: false, error: "reply JSON missing score/justification" };
  if (valid.length > 1) return { ok: false, error: "ambiguous reply: multiple score objects" };
  return { ok: true, ...valid[0]! };
}
