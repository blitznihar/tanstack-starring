import { argBool, argInt, argString, parseCliArgs, VALIDATION_PARENT_EMAIL, VALIDATION_PARENT_NAME, VALIDATION_STUDENT_EMAIL, VALIDATION_STUDENT_NAME, DEFAULT_PROGRAM_ARG, todayInCentral } from "./validationCore.js";
import { createOrResetValidationStudent } from "./dbValidation.js";

const args = parseCliArgs();

createOrResetValidationStudent({
  studentEmail: argString(args, "studentEmail", VALIDATION_STUDENT_EMAIL),
  parentEmail: argString(args, "parentEmail", VALIDATION_PARENT_EMAIL),
  parentName: argString(args, "parentName", VALIDATION_PARENT_NAME),
  studentName: argString(args, "studentName", VALIDATION_STUDENT_NAME),
  programArg: argString(args, "program", DEFAULT_PROGRAM_ARG),
  startDate: argString(args, "startDate", todayInCentral()),
  days: argInt(args, "days", 45),
  resetStudent: argBool(args, "resetStudent", true),
  dryRun: argBool(args, "dryRun", false),
  force: argBool(args, "force", false),
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
