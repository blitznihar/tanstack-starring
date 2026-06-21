import { env } from "~/lib/env.js";
import { noticeError, recordMetric } from "~/server/observability/newrelic.js";
import type { ChatMessage } from "./rubricPrompt.js";

/**
 * AI scoring client (§8) — the ONLY runtime LLM call in the whole app, and it is
 * used for SCR/ECR scoring exclusively. It calls an OpenAI-compatible Chat
 * Completions endpoint. The production configuration uses OpenAI with the
 * gpt-5.4-mini model and OPENAI_API_KEY. Server-side only.
 *
 * This module deliberately does NOT parse the score — it returns the raw assistant
 * text, which the pure `parseDmrReply` (domain) validates. Network/timeout/HTTP
 * failures throw `DmrError`, which the scoring service catches to fall back to the
 * manual queue. Submission is never blocked on any of this.
 */

const OPENAI_MODEL = "gpt-5.4-mini";

export class DmrError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DmrError";
  }
}

/** True when AI scoring is configured on. When false, callers route to manual. */
export function aiEnabled(): boolean {
  return env.ai.enabled;
}

function isOpenAiEndpoint(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === "api.openai.com" || host.endsWith(".openai.com");
  } catch {
    return false;
  }
}

export async function dmrChat(messages: ChatMessage[]): Promise<string> {
  if (!env.ai.enabled) throw new DmrError("AI scoring is disabled (AI_ENABLED=false)");

  const started = Date.now();
  const baseUrl = env.ai.baseUrl.replace(/\/$/, "");
  const openai = isOpenAiEndpoint(baseUrl);
  if (openai && !env.ai.openaiApiKey) throw new DmrError("OPENAI_API_KEY is required for OpenAI AI scoring");
  const url = `${baseUrl}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs);
  const body = openai
    ? {
        model: OPENAI_MODEL,
        messages,
        response_format: { type: "json_object" },
        max_completion_tokens: 1024,
      }
    : {
        model: env.ai.model,
        temperature: 0.2,
        messages,
        // Headroom for a 5-point ECR's justification + several tips. A 400-token
        // cap could cut a rich reply mid-JSON, silently inflating the manual queue.
        max_tokens: 1024,
      };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openai ? env.ai.openaiApiKey : "dmr-local"}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new DmrError(`AI scorer returned HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const choice = json.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new DmrError("AI scorer reply had no message content");
    }
    // A length-truncated reply is unreliable JSON — surface it explicitly (the
    // job then routes to manual with a clear reason) rather than failing as an
    // opaque "unparseable".
    if (choice?.finish_reason === "length") {
      throw new DmrError("AI scorer reply was truncated at max tokens — score this one manually");
    }
    recordMetric("Custom/OpenAI/Scoring/DurationMs", Date.now() - started);
    recordMetric("Custom/OpenAI/Scoring/Success", 1);
    return content;
  } catch (err) {
    recordMetric("Custom/OpenAI/Scoring/Failure", 1);
    if (err instanceof DmrError) {
      noticeError(err, { component: "openai_scoring", model: OPENAI_MODEL });
      throw err;
    }
    if (err instanceof Error && err.name === "AbortError") {
      const timeoutError = new DmrError(`AI scorer timed out after ${env.ai.timeoutMs}ms`, { cause: err });
      recordMetric("Custom/OpenAI/Scoring/Timeout", 1);
      noticeError(timeoutError, { component: "openai_scoring", model: OPENAI_MODEL });
      throw timeoutError;
    }
    const requestError = new DmrError(`AI scorer request failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    noticeError(requestError, { component: "openai_scoring", model: OPENAI_MODEL });
    throw requestError;
  } finally {
    clearTimeout(timer);
  }
}
