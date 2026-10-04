/**
 * Check the email configuration and send ONE test message through the same mailer
 * the backend uses (lib/mailer.js).
 *
 *   node scripts/send-test-email.js recipient@example.com
 *
 * EMAIL_TRANSPORT in .env decides what happens:
 *   smtp    → logs in to the SMTP server and sends a real email
 *   console → writes an .eml file to .mail-outbox (development; NOT delivered)
 *
 * Exit codes: 0 = accepted by the SMTP server (or written in console mode)
 *             1 = bad usage   2 = configuration / login problem   3 = send failed
 * Never prints SMTP credentials; the recipient is taken from the command line only.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const mailer = require("../lib/mailer");

(async () => {
  const to = process.argv[2];
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to)) {
    console.error("Usage: node scripts/send-test-email.js recipient@example.com");
    process.exit(1);
  }

  const check = await mailer.verifyTransport();
  console.log(`Transport : ${check.status}`);
  console.log(`Detail    : ${check.detail}`);
  for (const w of check.warnings || []) console.log(`Warning   : ${w}`);
  if (!check.ok) {
    console.error("RESULT    : FAILED — fix the configuration above (nothing was sent).");
    process.exit(2);
  }

  try {
    const result = await mailer.sendMail({
      to,
      subject: `${mailer.APP_NAME}: test email`,
      text: `This is a test email from ${mailer.APP_NAME}. If you received it, email delivery works.`,
      html: `<p>This is a test email from <b>${mailer.APP_NAME}</b>. If you received it, email delivery works.</p>`,
    });
    if (result.transport === "smtp" && result.delivered) {
      console.log(`RESULT    : SUCCESS — the SMTP server accepted the message for ${mailer.maskEmail(to)} (id ${result.messageId || "n/a"}).`);
      console.log("            Check the inbox (and Spam) of that address.");
    } else if (result.transport === "console") {
      console.log(`RESULT    : WRITTEN to .mail-outbox/${result.file} — Console transport - NOT delivered to ${mailer.maskEmail(to)}.`);
    } else {
      console.log("RESULT    : NOT SENT — email delivery is disabled (EMAIL_TRANSPORT=disabled).");
    }
    process.exit(0);
  } catch (err) {
    console.error(`RESULT    : FAILED — ${mailer.describeSmtpError(err)}`);
    process.exit(3);
  }
})();
