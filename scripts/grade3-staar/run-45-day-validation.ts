import { closeDb } from "~/repositories/db.js";
import { loadValidationDataset } from "./dbValidation.js";
import {
  argBool,
  argInt,
  argString,
  buildValidationReport,
  clearReportDir,
  DEFAULT_PROGRAM_ARG,
  DEFAULT_REPORT_DIR,
  parseCliArgs,
  todayInCentral,
  VALIDATION_PARENT_EMAIL,
  VALIDATION_PARENT_NAME,
  VALIDATION_STUDENT_EMAIL,
  VALIDATION_STUDENT_NAME,
  writeValidationReports,
} from "./validationCore.js";

const args = parseCliArgs();

async function main() {
  const reportDir = argString(args, "reportDir", DEFAULT_REPORT_DIR);
  if (!argBool(args, "keepReports", false)) await clearReportDir(reportDir);
  const programArg = argString(args, "program", DEFAULT_PROGRAM_ARG);
  const dataset = await loadValidationDataset(programArg);
  const report = buildValidationReport(dataset, {
    studentEmail: argString(args, "studentEmail", VALIDATION_STUDENT_EMAIL),
    studentName: argString(args, "studentName", VALIDATION_STUDENT_NAME),
    parentName: argString(args, "parentName", VALIDATION_PARENT_NAME),
    parentEmail: argString(args, "parentEmail", VALIDATION_PARENT_EMAIL),
    programArg,
    startDate: argString(args, "startDate", todayInCentral()),
    days: argInt(args, "days", dataset.program.targetDays || 45),
    reportDir,
  });
  const files = argBool(args, "generateReports", true) ? await writeValidationReports(report, reportDir) : [];
  console.log(JSON.stringify({
    status: report.status,
    errors: report.totals.errors,
    warnings: report.totals.warnings,
    scheduleDays: report.totals.scheduleDays,
    endDate: report.metadata.endDate,
    reportDir,
    files,
  }, null, 2));
  if (report.status === "FAIL") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
