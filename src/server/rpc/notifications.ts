import { createServerFn } from "@tanstack/react-start";
import { notificationsRepo, type NotificationKind } from "~/repositories/notifications.js";
import { requireAuth } from "./context.js";

const KIND_LABELS: Record<NotificationKind, string> = {
  redemption_requested: "Redemption request",
  redemption_approved: "Redemption approved",
  reward_rule_created: "Reward update",
  practice_report: "Practice report",
  exam_report: "Exam report",
  password_reset: "Password reset",
  email_confirmation: "Email confirmed",
};

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function previewText(value: string): string {
  const plain = decodeEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > 180 ? `${plain.slice(0, 177)}...` : plain;
}

export const myNotifications = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  const [items, unreadCount] = await Promise.all([
    notificationsRepo.listForUser(auth.userId, 20),
    notificationsRepo.unreadCount(auth.userId),
  ]);
  return {
    unreadCount,
    items: items.map((item) => ({
      id: item._id,
      kind: item.kind,
      label: KIND_LABELS[item.kind],
      subject: item.subject,
      preview: previewText(item.body),
      channel: item.channel,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      readAt: item.readAt?.toISOString() ?? null,
    })),
  };
});

export const markNotificationRead = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => ({ id: String(d.id ?? "") }))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    if (!data.id) throw new Error("Notification id is required");
    await notificationsRepo.markRead(auth.userId, data.id);
    return { ok: true as const };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" }).handler(async () => {
  const auth = await requireAuth();
  await notificationsRepo.markAllRead(auth.userId);
  return { ok: true as const };
});
