/**
 * Send one sample of every Comet email notification kind to the Super Admin.
 * Requires SMTP settings in .env:
 * EMAIL_FROM, SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
 */
import { closeDb } from "~/repositories/db.js";
import { notificationsRepo, type NotificationKind } from "~/repositories/notifications.js";
import { usersRepo } from "~/repositories/users.js";
import { missingEmailConfig, sendNotificationEmail } from "~/server/notifications/smtp.js";
import { userId } from "~/server/users/associations.js";

const samples: Array<{ kind: NotificationKind; subject: string; body: string }> = [
  {
    kind: "redemption_requested",
    subject: "[Comet Test] Redemption request received",
    body: "We received the request for Roblox: 1,000 Robux. The admin team is reviewing it and will cash the Robux into the account once approved.",
  },
  {
    kind: "redemption_approved",
    subject: "[Comet Test] Redemption approved",
    body: "The request for Roblox: 1,000 Robux has been approved. The admin team is working on fulfillment.",
  },
  {
    kind: "reward_rule_created",
    subject: "[Comet Test] New reward rule added",
    body: "A new reward rule is available: Family trip to Chicago for streak 20.",
  },
  {
    kind: "practice_report",
    subject: "[Comet Test] Practice report for Maya Rivera",
    body: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:680px;color:#3a344d;">
        <h2 style="margin:0 0 6px;color:#2f2943;">Comet Academy Practice Report</h2>
        <p style="margin:0 0 18px;color:#746b88;">Maya Rivera - Grade 3 STAAR - test email</p>
        <h3 style="margin:0 0 8px;color:#2f2943;">Lessons Finished Today</h3>
        <ul style="margin:0 0 18px;padding-left:20px;"><li>Math - TEKS 3.3B - Fractions on a Number Line</li><li>RLA - TEKS 3.7C - Text Evidence</li></ul>
        <h3 style="margin:0 0 8px;color:#2f2943;">Practice</h3>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border:1px solid #e4dced;">Questions solved</td><td style="padding:8px;border:1px solid #e4dced;"><strong>12</strong></td></tr>
          <tr><td style="padding:8px;border:1px solid #e4dced;">Right vs wrong</td><td style="padding:8px;border:1px solid #e4dced;"><strong>9</strong> right, <strong>3</strong> wrong</td></tr>
        </table>
      </div>`,
  },
  {
    kind: "exam_report",
    subject: "[Comet Test] Exam report for Maya Rivera",
    body: `
      <div style="font-family:Inter,Arial,sans-serif;max-width:680px;color:#3a344d;">
        <h2 style="margin:0 0 6px;color:#2f2943;">Comet Academy Exam Report</h2>
        <p style="margin:0 0 18px;color:#746b88;">Maya Rivera - Grade 3 STAAR - test email</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border:1px solid #e4dced;">Lessons today</td><td style="padding:8px;border:1px solid #e4dced;">Math 3.3B, RLA 3.7C</td></tr>
          <tr><td style="padding:8px;border:1px solid #e4dced;">Practice solved</td><td style="padding:8px;border:1px solid #e4dced;">12 questions, 9 right, 3 wrong</td></tr>
          <tr><td style="padding:8px;border:1px solid #e4dced;">Exam right / wrong</td><td style="padding:8px;border:1px solid #e4dced;"><strong>18</strong> right, <strong>4</strong> wrong</td></tr>
          <tr><td style="padding:8px;border:1px solid #e4dced;">Score</td><td style="padding:8px;border:1px solid #e4dced;"><strong>82%</strong></td></tr>
        </table>
      </div>`,
  },
  {
    kind: "password_reset",
    subject: "[Comet Test] Password reset",
    body: "Your password was reset to Password@1234. Sign in and choose a new password from Account Setup.",
  },
  {
    kind: "email_confirmation",
    subject: "[Comet Test] Email address confirmed",
    body: "Your Comet Academy email address was confirmed as blitznihar@gmail.com.",
  },
];

async function main() {
  const missing = missingEmailConfig();
  if (missing.length > 0) {
    throw new Error(`Cannot send real email yet. Add these to .env: ${missing.join(", ")}`);
  }

  const superAdmin = (await usersRepo.list()).find((user) => user.active && user.roles.includes("super_admin"));
  if (!superAdmin) throw new Error("No active Super Admin user found.");
  const id = userId(superAdmin);
  const to = superAdmin.email;
  if (!to) throw new Error("Super Admin does not have an email address.");

  for (const sample of samples) {
    const notification = await notificationsRepo.queue({
      userId: id,
      recipientEmail: to,
      kind: sample.kind,
      subject: sample.subject,
      body: sample.body.trim(),
    });
    try {
      await sendNotificationEmail(notification);
      await notificationsRepo.markSent(notification._id);
      console.log(`sent ${sample.kind} -> ${to}`);
    } catch (error) {
      await notificationsRepo.markFailed(notification._id, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
