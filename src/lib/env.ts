/**
 * Central environment access. Nothing else in the app reads `process.env` directly,
 * so swapping local Docker → Atlas or OpenAI-compatible AI providers is a config
 * change, not a code change.
 */

function str(key: string, fallback?: string): string {
  const v = process.env[key];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return v;
}

function num(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (Number.isNaN(n)) throw new Error(`Environment variable ${key} must be a number, got "${v}"`);
  return n;
}

function bool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return v === "true" || v === "1";
}

export function mongodbDatabaseNameForVercelEnv(vercelEnv = process.env.VERCEL_ENV): "comet" | "comet-dev" {
  return vercelEnv?.toLowerCase() === "production" ? "comet" : "comet-dev";
}

export const env = {
  get mongodbUri() {
    return str("MONGODB_URI", "mongodb://localhost:27017/comet-dev");
  },
  get mongodbDatabaseName() {
    return mongodbDatabaseNameForVercelEnv();
  },
  get sessionSecret() {
    return str("SESSION_SECRET", "change-me");
  },
  get ai() {
    return {
      enabled: bool("AI_ENABLED", true),
      baseUrl: str("AI_BASE_URL", "https://api.openai.com/v1"),
      model: str("AI_MODEL", "gpt-5.4-mini"),
      openaiApiKey: str("OPENAI_API_KEY", ""),
      timeoutMs: num("AI_TIMEOUT_MS", 60000),
    };
  },
  get auth0() {
    const domain = str("AUTH0_DOMAIN", "");
    const clientId = str("AUTH0_CLIENT_ID", "");
    const clientSecret = str("AUTH0_CLIENT_SECRET", "");
    return {
      enabled: domain.trim() !== "" && clientId.trim() !== "" && clientSecret.trim() !== "",
      domain,
      clientId,
      clientSecret,
      callbackUrl: str("AUTH0_CALLBACK_URL", "http://localhost:5173/callback"),
      logoutUrl: str("AUTH0_LOGOUT_URL", "http://localhost:5173/logout"),
      connection: str("AUTH0_CONNECTION", ""),
    };
  },
  get robux() {
    return {
      weeklyBudget: num("WEEKLY_ROBUX_BUDGET", 1000),
      examShare: num("EXAM_ROBUX_SHARE", 0.5),
      examWrongPenalty: num("EXAM_WRONG_PENALTY", 10),
      examAwardFloor: num("EXAM_AWARD_FLOOR", 0),
    };
  },
  get apiBaseUrl() {
    return str("API_BASE_URL", "http://localhost:3000");
  },
  get email() {
    const host = str("SMTP_HOST", "");
    const user = str("SMTP_USER", "");
    const pass = str("SMTP_PASS", "");
    const from = str("EMAIL_FROM", user ? `Comet Academy <${user}>` : "Comet Academy <no-reply@example.com>");
    return {
      enabled: host.trim() !== "" && from.trim() !== "",
      from,
      host,
      port: num("SMTP_PORT", 587),
      secure: bool("SMTP_SECURE", false),
      user,
      pass,
    };
  },
  get stripe() {
    const secretKey = str("STRIPE_SECRET_KEY", "sk_test_placeholder");
    const publishableKey = str("STRIPE_PUBLISHABLE_KEY", "pk_test_placeholder");
    // "enabled" = a real Stripe key is configured. Otherwise the app runs in demo
    // mode (no real charge), exactly like the prototype. A placeholder/"..." key
    // (the .env.example default) is treated as NOT configured. The guardrail is
    // TEST MODE in dev (§), so only `sk_test_` keys enable Stripe by default; a
    // live key requires the explicit STRIPE_ALLOW_LIVE opt-in.
    const isPlaceholder = (k: string) => k.includes("placeholder") || k.includes("...") || k.trim() === "";
    const allowLive = bool("STRIPE_ALLOW_LIVE", false);
    const usable = !isPlaceholder(secretKey) && (secretKey.startsWith("sk_test_") || (secretKey.startsWith("sk_live_") && allowLive));
    return {
      secretKey,
      publishableKey,
      webhookSecret: str("STRIPE_WEBHOOK_SECRET", "whsec_placeholder"),
      baseUrl: str("STRIPE_API_BASE_URL", "https://api.stripe.com/v1"),
      allowLive,
      enabled: usable,
    };
  },
};
