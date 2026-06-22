import { argString, DEFAULT_REPORT_DIR, parseCliArgs, readValidationReport } from "./validationCore.js";

const args = parseCliArgs();

async function main() {
  const reportDir = argString(args, "reportDir", DEFAULT_REPORT_DIR);
  const report = await readValidationReport(reportDir);
  if (!report) throw new Error(`Missing validation report JSON in ${reportDir}. Run bun run validate:grade3:45day first.`);

  const checks = [
    ["student email", report.metadata.studentEmail],
    ["parent email", report.metadata.parentEmail],
    ["program title", report.metadata.programTitle],
    ["start date", report.metadata.startDate],
    ["end date", report.metadata.endDate],
    ["status", report.status],
  ] as const;

  const baseUrl = argString(args, "baseUrl", "");
  const output: Record<string, unknown> = {
    reportDir,
    reportStatus: report.status,
    localChecks: Object.fromEntries(checks.map(([name, value]) => [name, Boolean(value)])),
  };

  if (baseUrl) {
    const url = new URL("/admin/reports/grade3-staar-45-day", baseUrl).toString();
    const response = await fetch(url);
    const html = await response.text();
    output.url = url;
    output.status = response.status;
    output.routeChecks = {
      ok: response.ok,
      studentEmail: html.includes(report.metadata.studentEmail),
      parentEmail: html.includes(report.metadata.parentEmail),
      programTitle: html.includes(report.metadata.programTitle),
      summaryStatus: html.includes(report.status),
      scheduleTable: html.includes("45-Day Schedule"),
      examReadiness: html.includes("Exam Readiness"),
      questionValidation: html.includes("Question Validation"),
    };
    const routeChecks = output.routeChecks as Record<string, boolean>;
    if (!response.ok || Object.values(routeChecks).some((value) => !value)) {
      console.log(JSON.stringify(output, null, 2));
      throw new Error("Report viewer route did not render all expected validation markers.");
    }
  }

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
