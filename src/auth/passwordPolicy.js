/** Mirrors the backend password policy (lib/passwords.js) for instant feedback. */
export function policyErrors(password, email) {
  const errors = [];
  if (password.length < 8) errors.push('At least 8 characters.');
  if (new TextEncoder().encode(password).length > 72) errors.push('At most 72 bytes.');
  if (!/[A-Za-z]/.test(password)) errors.push('Must contain a letter.');
  if (!/[0-9]/.test(password)) errors.push('Must contain a number.');
  if (email && password.trim().toLowerCase() === String(email).trim().toLowerCase()) {
    errors.push('Must not be the same as your email.');
  }
  return errors;
}
