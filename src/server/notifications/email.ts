import { notificationsRepo, type NotificationKind } from "~/repositories/notifications.js";
import { usersRepo } from "~/repositories/users.js";
import { parentsForStudent, userId } from "~/server/users/associations.js";
import { emailDeliveryConfigured, sendNotificationEmail } from "./smtp.js";

type EmailInput = {
  userId: string;
  kind: NotificationKind;
  subject: string;
  body: string;
};

export async function queueEmailNotification(input: EmailInput) {
  const user = await usersRepo.findById(input.userId);
  const notification = await notificationsRepo.queue({ ...input, recipientEmail: user?.email ?? "blitznihar@gmail.com" });
  if (!emailDeliveryConfigured()) return notification;
  try {
    await sendNotificationEmail(notification);
    await notificationsRepo.markSent(notification._id);
  } catch (error) {
    await notificationsRepo.markFailed(notification._id, error instanceof Error ? error.message : String(error));
  }
  return notification;
}

export async function queueStudentAndParentEmails(
  studentId: string,
  message: Omit<EmailInput, "userId">,
): Promise<void> {
  const parents = await parentsForStudent(studentId);
  const userIds = [...new Set([studentId, ...parents.map(userId)])];
  await Promise.all(userIds.map((id) => queueEmailNotification({ userId: id, ...message })));
}
