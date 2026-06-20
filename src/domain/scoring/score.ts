import type { Item, ItemOption } from "~/schemas/item.js";

/**
 * Deterministic scorer for all selected/structured item types, including partial
 * credit where `allowPartialCredit`. SCR/ECR are NOT scored here — they route to
 * the async LLM/manual queue (§8).
 *
 * §20.7 crash-safety: response values may be strings, arrays, or objects. Never
 * call string methods on them unguarded.
 */

export type ScoreResult = {
  /** Points earned for this item. */
  earned: number;
  /** Maximum points possible. */
  max: number;
  /** Fully correct (earned === max and max > 0). */
  correct: boolean;
  /** True when scoring requires the async LLM/manual queue (scr/ecr). */
  requiresAsync: boolean;
};

const asString = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

function normalize(v: unknown): string {
  return asString(v).toLowerCase().replace(/\s+/g, " ");
}

function asArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => asString(x)).filter((s) => s.length > 0);
  const s = asString(v);
  return s ? [s] : [];
}

function correctKeys(options: ItemOption[] | undefined): string[] {
  return (options ?? []).filter((o) => o.correct).map((o) => o.key);
}

/** Numeric-aware equality for griddable/text-entry answers ("0.5" === ".50"). */
function answersEqual(a: unknown, b: unknown): boolean {
  const na = Number(asString(a));
  const nb = Number(asString(b));
  if (!Number.isNaN(na) && !Number.isNaN(nb) && asString(a) !== "" && asString(b) !== "") {
    return na === nb;
  }
  return normalize(a) === normalize(b);
}

export function scoreItem(item: Item, response: unknown): ScoreResult {
  const max = item.points ?? 1;

  switch (item.type) {
    case "scr":
    case "ecr":
      return { earned: 0, max: item.rubric?.maxPoints ?? max, correct: false, requiresAsync: true };

    case "multiple_choice": {
      const keys = correctKeys(item.options);
      const picked = asString(response);
      const ok = keys.length > 0 && keys.includes(picked);
      return { earned: ok ? max : 0, max, correct: ok, requiresAsync: false };
    }

    case "multiselect": {
      const keys = correctKeys(item.options);
      const picked = new Set(asArray(response));
      const correctSet = new Set(keys);
      const hits = [...picked].filter((k) => correctSet.has(k)).length;
      const wrong = [...picked].filter((k) => !correctSet.has(k)).length;
      const fullyCorrect = hits === correctSet.size && wrong === 0 && picked.size > 0;
      if (item.allowPartialCredit) {
        // Net correct selections, never negative, scaled across required keys.
        const net = Math.max(0, hits - wrong);
        const earned = correctSet.size === 0 ? 0 : Math.round((net / correctSet.size) * max);
        return { earned: Math.min(earned, max), max, correct: fullyCorrect, requiresAsync: false };
      }
      return { earned: fullyCorrect ? max : 0, max, correct: fullyCorrect, requiresAsync: false };
    }

    case "inline_choice":
    case "text_entry": {
      // blanks: { blankId: correctValue }; response: { blankId: value } or a bare value.
      const blanks = item.blanks;
      if (blanks && Object.keys(blanks).length > 0) {
        const resp = (response && typeof response === "object" ? response : {}) as Record<string, unknown>;
        const ids = Object.keys(blanks);
        const hits = ids.filter((id) => answersEqual(resp[id], blanks[id])).length;
        const fullyCorrect = hits === ids.length;
        if (item.allowPartialCredit) {
          const earned = Math.round((hits / ids.length) * max);
          return { earned, max, correct: fullyCorrect, requiresAsync: false };
        }
        return { earned: fullyCorrect ? max : 0, max, correct: fullyCorrect, requiresAsync: false };
      }
      const ok = answersEqual(response, item.answer ?? item.correct);
      return { earned: ok ? max : 0, max, correct: ok, requiresAsync: false };
    }

    case "number_line":
    case "hot_spot": {
      const ok = answersEqual(response, item.answer ?? item.correct);
      return { earned: ok ? max : 0, max, correct: ok, requiresAsync: false };
    }

    case "hot_text": {
      const correct = asArray(item.correct);
      const picked = new Set(asArray(response));
      const fullyCorrect =
        correct.length > 0 && correct.every((k) => picked.has(k)) && picked.size === correct.length;
      if (item.allowPartialCredit && correct.length > 0) {
        const hits = correct.filter((k) => picked.has(k)).length;
        const wrong = [...picked].filter((k) => !correct.includes(k)).length;
        const net = Math.max(0, hits - wrong);
        return {
          earned: Math.min(Math.round((net / correct.length) * max), max),
          max,
          correct: fullyCorrect,
          requiresAsync: false,
        };
      }
      return { earned: fullyCorrect ? max : 0, max, correct: fullyCorrect, requiresAsync: false };
    }

    case "drag_and_drop": {
      // targets: [{id, accepts:[draggableId]}]; response: { targetId: draggableId }
      const targets = item.targets ?? [];
      const resp = (response && typeof response === "object" ? response : {}) as Record<string, unknown>;
      const hits = targets.filter((t) => t.accepts.includes(asString(resp[t.id]))).length;
      const fullyCorrect = targets.length > 0 && hits === targets.length;
      if (item.allowPartialCredit && targets.length > 0) {
        return { earned: Math.round((hits / targets.length) * max), max, correct: fullyCorrect, requiresAsync: false };
      }
      return { earned: fullyCorrect ? max : 0, max, correct: fullyCorrect, requiresAsync: false };
    }

    case "multipart": {
      // Each part scored as its own selected/structured item; sum across parts.
      const parts = item.parts ?? [];
      const resp = (response && typeof response === "object" ? response : {}) as Record<string, unknown>;
      if (parts.length === 0) return { earned: 0, max, correct: false, requiresAsync: false };
      const per = max / parts.length;
      let earned = 0;
      let allCorrect = true;
      let anyAsync = false;
      for (const part of parts) {
        // Build a self-contained sub-item from the PART's answer key only —
        // never inherit the parent's answer-shape fields (blanks/targets/zones/…).
        const sub: Item = {
          ...item,
          type: part.type,
          options: part.options,
          correct: part.correct,
          answer: part.answer,
          blanks: part.blanks,
          targets: part.targets,
          zones: undefined,
          tokens: undefined,
          draggables: undefined,
          parts: undefined,
          points: per,
          allowPartialCredit: false,
        };
        const r = scoreItem(sub, resp[part.id]);
        if (r.requiresAsync) {
          anyAsync = true;
          allCorrect = false;
          continue;
        }
        earned += r.earned;
        if (!r.correct) allCorrect = false;
      }
      // A written (scr/ecr) part routes the whole item to the async queue (§8).
      if (anyAsync) return { earned: 0, max, correct: false, requiresAsync: true };
      // Without partial credit, all-or-nothing across parts.
      if (!item.allowPartialCredit) {
        return { earned: allCorrect ? max : 0, max, correct: allCorrect, requiresAsync: false };
      }
      return { earned: Math.round(earned), max, correct: allCorrect, requiresAsync: false };
    }

    default:
      return { earned: 0, max, correct: false, requiresAsync: false };
  }
}
