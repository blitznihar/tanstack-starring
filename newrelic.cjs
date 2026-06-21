"use strict";

exports.config = {
  app_name: [process.env.NEW_RELIC_APP_NAME || "comet-academy"],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  agent_enabled: process.env.NEW_RELIC_ENABLED === "true" || process.env.NEW_RELIC_ENABLED === "1",
  distributed_tracing: {
    enabled: process.env.NEW_RELIC_DISTRIBUTED_TRACING_ENABLED !== "false",
  },
  application_logging: {
    enabled: process.env.NEW_RELIC_APPLICATION_LOGGING_ENABLED !== "false",
    forwarding: {
      enabled: process.env.NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED !== "false",
    },
  },
  logging: {
    level: process.env.NEW_RELIC_LOG_LEVEL || "info",
  },
  allow_all_headers: false,
  attributes: {
    exclude: [
      "request.headers.cookie",
      "request.headers.authorization",
      "request.headers.proxyAuthorization",
      "request.headers.x*",
      "response.headers.setCookie*",
    ],
  },
};
