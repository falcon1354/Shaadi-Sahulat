/**
 * Credentials for seed / maintenance scripts — never hardcoded.
 *
 * Source order: environment variables → interactive hidden prompt (only when
 * running in a terminal) → clear failure. Passwords are validated with the
 * normal password policy and are never echoed or logged.
 *
 *   ADMIN_SEED_EMAIL, ADMIN_SEED_PASSWORD, ADMIN_SEED_NAME (optional)
 *   DEMO_BUYER_PASSWORD (scripts/fix-demo-logins.js only)
 */

const readline = require("readline");
const { validatePasswordPolicy } = require("./passwords");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

class SeedCredentialError extends Error {}

function promptVisible(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()); }));
}

/** Prompt without echoing the typed characters. */
function promptHidden(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  const write = rl._writeToOutput.bind(rl);
  let muted = false;
  rl._writeToOutput = (s) => { if (!muted) write(s); };
  return new Promise((resolve) => {
    rl.question(question, (answer) => { rl.close(); process.stdout.write("\n"); resolve(answer); });
    muted = true;
  });
}

async function _password(envValue, label, { interactive, email }) {
  let password = envValue || "";
  if (!password && interactive) {
    password = await promptHidden(`${label}: `);
    const confirm = await promptHidden(`Confirm ${label.toLowerCase()}: `);
    if (password !== confirm) throw new SeedCredentialError(`${label} entries did not match.`);
  }
  if (!password) return "";
  const policy = validatePasswordPolicy(password, { email });
  if (!policy.ok) throw new SeedCredentialError(`${label} does not meet the password policy: ${policy.errors.join(" ")}`);
  return password;
}

/**
 * Resolve admin seed credentials. Throws SeedCredentialError (message never
 * contains the password) when they are missing or invalid.
 */
async function resolveAdminSeedCredentials({ env = process.env, interactive = Boolean(process.stdin.isTTY) } = {}) {
  let email = String(env.ADMIN_SEED_EMAIL || "").trim().toLowerCase();
  if (!email && interactive) email = (await promptVisible("Admin email: ")).toLowerCase();
  if (!email) {
    throw new SeedCredentialError(
      "Admin seed credentials are missing. Set ADMIN_SEED_EMAIL and ADMIN_SEED_PASSWORD in .env " +
      "(see .env.example) or run this script in an interactive terminal to be prompted."
    );
  }
  if (!EMAIL_RE.test(email)) throw new SeedCredentialError("ADMIN_SEED_EMAIL is not a valid email address.");

  const password = await _password(env.ADMIN_SEED_PASSWORD, "Admin password", { interactive, email });
  if (!password) {
    throw new SeedCredentialError(
      "Admin seed password is missing. Set ADMIN_SEED_PASSWORD in .env or run this script in an interactive terminal."
    );
  }
  const name = String(env.ADMIN_SEED_NAME || "Super Admin").trim() || "Super Admin";
  return { email, password, name };
}

/** Optional demo-buyer password (empty string when not provided). */
async function resolveDemoBuyerPassword({ env = process.env, interactive = Boolean(process.stdin.isTTY) } = {}) {
  return _password(env.DEMO_BUYER_PASSWORD, "Demo buyer password", { interactive, email: "" });
}

module.exports = { SeedCredentialError, resolveAdminSeedCredentials, resolveDemoBuyerPassword };
