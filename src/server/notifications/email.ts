import { notificationsRepo, type NotificationKind } from "~/repositories/notifications.js";
import { parentsForStudent, userId } from "~/server/users/associations.js";

type EmailInput = {
  userId: string;
  kind: NotificationKind;
  subject: string;
  body: string;
};

export async function queueEmailNotification(input: EmailInput): Promise<void> {
  await notificationsRepo.queue(input);
}

export async function queueStudentAndParentEmails(
  studentId: string,
  message: Omit<EmailInput, "userId">,
): Promise<void> {
  const parents = await parentsForStudent(studentId);
  const userIds = [...new Set([studentId, ...parents.map(userId)])];
  await Promise.all(userIds.map((id) => queueEmailNotification({ userId: id, ...message })));
}
