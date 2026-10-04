/**
 * Prints a bcrypt hash for BANK_OFFICER_PASSWORD_HASH in .env.
 *   node scripts/hash-bank-officer-password.js
 * The password is typed at a hidden prompt (never passed on the command line, so it
 * does not end up in shell history) and is never written anywhere.
 */
const readline = require("readline");
const bcrypt = require("bcryptjs");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
rl._writeToOutput = (s) => { if (!rl.muted) rl.output.write(s); };
rl.question("New bank officer password (min 10 chars): ", (pw) => {
  rl.muted = false;
  rl.close();
  process.stdout.write("\n");
  if (typeof pw !== "string" || pw.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }
  console.log("\nAdd this line to .env (then restart the backend):");
  console.log(`BANK_OFFICER_PASSWORD_HASH=${bcrypt.hashSync(pw, 12)}`);
});
rl.muted = true;
