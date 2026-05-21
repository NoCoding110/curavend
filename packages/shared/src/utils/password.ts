interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a password against the application's strength requirements.
 *
 * Rules:
 * - At least 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one digit
 * - At least one special character (@$!%*?&#)
 */
export function validatePassword(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push('Password must be at least 8 characters');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must include at least one lowercase letter');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must include at least one uppercase letter');
  }
  if (!/\d/.test(password)) {
    errors.push('Password must include at least one number');
  }
  if (!/[@$!%*?&#]/.test(password)) {
    errors.push('Password must include at least one special character (@$!%*?&#)');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
