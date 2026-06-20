import nodemailer from "nodemailer";
import { env } from "~/lib/env.js";
import type { NotificationDoc } from "~/repositories/notifications.js";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function htmlToText(value: string): string {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h1|h2|h3|tr|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function emailDeliveryConfigured(): boolean {
  const config = env.email;
  return config.enabled && config.host.trim() !== "" && config.from.trim() !== "";
}

export function missingEmailConfig(): string[] {
  const config = env.email;
  const missing: string[] = [];
  if (!config.from.trim()) missing.push("EMAIL_FROM");
  if (!config.host.trim()) missing.push("SMTP_HOST");
  if (!config.user.trim()) missing.push("SMTP_USER");
  if (!config.pass.trim()) missing.push("SMTP_PASS");
  return missing;
}

export async function sendNotificationEmail(notification: NotificationDoc): Promise<void> {
  const config = env.email;
  if (!emailDeliveryConfigured()) throw new Error(`Email delivery is not configured. Missing: ${missingEmailConfig().join(", ") || "SMTP settings"}`);
  if (!notification.recipientEmail) throw new Error("Notification has no recipientEmail.");

  const bodyIsHtml = isHtml(notification.body);
  const html = bodyIsHtml ? notification.body : `<p>${escapeHtml(notification.body).replace(/\n/g, "<br />")}</p>`;
  const text = bodyIsHtml ? htmlToText(notification.body) : notification.body;
  const auth = config.user || config.pass ? { user: config.user, pass: config.pass } : undefined;
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    ...(auth ? { auth } : {}),
  });

  await transport.sendMail({
    from: config.from,
    to: notification.recipientEmail,
    subject: notification.subject,
    text,
    html,
  });
}
