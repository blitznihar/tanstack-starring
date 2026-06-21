type NewRelicApi = {
  addCustomAttributes?: (attributes: Record<string, string | number | boolean>) => void;
  noticeError?: (error: Error, customAttributes?: Record<string, string | number | boolean>) => void;
  recordMetric?: (name: string, value: number) => void;
};

let apiPromise: Promise<NewRelicApi | null> | null = null;

function enabled(): boolean {
  return (process.env.NEW_RELIC_ENABLED === "true" || process.env.NEW_RELIC_ENABLED === "1") && Boolean(process.env.NEW_RELIC_LICENSE_KEY);
}

async function getApi(): Promise<NewRelicApi | null> {
  if (!enabled()) return null;
  apiPromise ??= import("newrelic")
    .then((module) => {
      const api = "default" in module ? module.default : module;
      return api as NewRelicApi;
    })
    .catch((error) => {
      console.warn(`New Relic instrumentation unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    });
  return apiPromise;
}

export function recordMetric(name: string, value: number): void {
  void getApi().then((api) => api?.recordMetric?.(name, value));
}

export function noticeError(error: unknown, attributes: Record<string, string | number | boolean> = {}): void {
  const normalized = error instanceof Error ? error : new Error(String(error));
  void getApi().then((api) => api?.noticeError?.(normalized, attributes));
}

export function addCustomAttributes(attributes: Record<string, string | number | boolean>): void {
  void getApi().then((api) => api?.addCustomAttributes?.(attributes));
}
