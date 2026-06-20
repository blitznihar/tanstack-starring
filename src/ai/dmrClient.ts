import { env } from "~/lib/env.js";
import type { ChatMessage } from "./rubricPrompt.js";

/**
 * Docker Model Runner (DMR) client (§8) — the ONLY runtime LLM call in the whole
 * app, and it is used for SCR/ECR scoring exclusively. OpenAI-compatible Chat
 * Completions: POST `${AI_BASE_URL}/chat/completions`, model = the pulled tag,
 * `temperature: 0.2`, dummy API key. Server-side only.
 *
 * This module deliberately does NOT parse the score — it returns the raw assistant
 * text, which the pure `parseDmrReply` (domain) validates. Network/timeout/HTTP
 * failures throw `DmrError`, which the scoring service catches to fall back to the
 * manual queue. Submission is never blocked on any of this.
 */

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

export async function dmrChat(messages: ChatMessage[]): Promise<string> {
  if (!env.ai.enabled) throw new DmrError("AI scoring is disabled (AI_ENABLED=false)");

  const url = `${env.ai.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.ai.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // DMR ignores the key but the OpenAI client shape expects one.
        Authorization: "Bearer dmr-local",
      },
      body: JSON.stringify({
        model: env.ai.model,
        temperature: 0.2,
        messages,
        // Headroom for a 5-point ECR's justification + several tips. A 400-token
        // cap could cut a rich reply mid-JSON, silently inflating the manual queue.
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new DmrError(`DMR returned HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
    };
    const choice = json.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new DmrError("DMR reply had no message content");
    }
    // A length-truncated reply is unreliable JSON — surface it explicitly (the
    // job then routes to manual with a clear reason) rather than failing as an
    // opaque "unparseable".
    if (choice?.finish_reason === "length") {
      throw new DmrError("DMR reply was truncated at max_tokens — score this one manually");
    }
    return content;
  } catch (err) {
    if (err instanceof DmrError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new DmrError(`DMR timed out after ${env.ai.timeoutMs}ms`, { cause: err });
    }
    throw new DmrError(`DMR request failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }
}
