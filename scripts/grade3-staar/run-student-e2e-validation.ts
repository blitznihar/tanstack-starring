import { closeDb } from "~/repositories/db.js";
import { createOrResetValidationStudent, loadValidationDataset } from "./dbValidation.js";
import {
  argBool,
  argInt,
  argString,
  buildValidationReport,
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
  const programArg = argString(args, "program", DEFAULT_PROGRAM_ARG);
  const startDate = argString(args, "startDate", todayInCentral());
  const days = argInt(args, "days", 45);
  const dryRun = argBool(args, "dryRun", false);

  const setup = await createOrResetValidationStudent({
    studentEmail: argString(args, "studentEmail", VALIDATION_STUDENT_EMAIL),
    parentEmail: argString(args, "parentEmail", VALIDATION_PARENT_EMAIL),
    parentName: argString(args, "parentName", VALIDATION_PARENT_NAME),
    studentName: argString(args, "studentName", VALIDATION_STUDENT_NAME),
    programArg,
    startDate,
    days,
    resetStudent: argBool(args, "resetStudent", true),
    dryRun,
    force: argBool(args, "force", false),
  });

  const dataset = await loadValidationDataset(programArg);
  const report = buildValidationReport(dataset, {
    studentEmail: setup.studentEmail,
    studentName: argString(args, "studentName", VALIDATION_STUDENT_NAME),
    parentName: argString(args, "parentName", VALIDATION_PARENT_NAME),
    parentEmail: setup.parentEmail,
    programArg,
    startDate,
    days,
    reportDir: argString(args, "reportDir", DEFAULT_REPORT_DIR),
  });
  const files = argBool(args, "generateReports", true) ? await writeValidationReports(report) : [];
  console.log(JSON.stringify({
    setup,
    validation: {
      status: report.status,
      errors: report.totals.errors,
      warnings: report.totals.warnings,
      endDate: report.metadata.endDate,
      files,
    },
  }, null, 2));
  if (report.status === "FAIL") process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(() => closeDb());
