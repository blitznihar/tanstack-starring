import { argBool, argString, DEFAULT_PROGRAM_ARG, parseCliArgs, VALIDATION_PARENT_EMAIL, VALIDATION_STUDENT_EMAIL } from "./validationCore.js";
import { cleanupValidationStudent } from "./dbValidation.js";

const args = parseCliArgs();

cleanupValidationStudent({
  studentEmail: argString(args, "studentEmail", VALIDATION_STUDENT_EMAIL),
  parentEmail: argString(args, "parentEmail", VALIDATION_PARENT_EMAIL),
  programArg: argString(args, "program", DEFAULT_PROGRAM_ARG),
  confirmEmail: argString(args, "confirmEmail", ""),
  dryRun: argBool(args, "dryRun", true),
  deleteReports: argBool(args, "deleteReports", false),
  force: argBool(args, "force", false),
})
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.safeToExecute && !result.dryRun) process.exitCode = 1;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
