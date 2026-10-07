export const USERNAME_PATTERN = /^[A-Za-z0-9_.-]{3,20}$/;

export function validateUsername(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < 3) return 'Usernames need at least 3 characters.';
  if (trimmed.length > 20) return 'Usernames can be at most 20 characters.';
  if (!USERNAME_PATTERN.test(trimmed)) {
    return 'Use letters, numbers and _ . - only.';
  }
  return null;
}

export function validateEmail(value: string): string | null {
  if (!value.trim()) return 'Enter your email address.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim())) return 'That email does not look right.';
  return null;
}

export function validatePassword(value: string): string | null {
  if (value.length < 6) return 'Passwords need at least 6 characters.';
  if (value.length > 128) return 'That password is too long.';
  return null;
}

export function passwordStrength(value: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score += 1;
  if (/\d/.test(value) || /[^A-Za-z0-9]/.test(value)) score += 1;
  const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'] as const;
  const clamped = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  return { score: clamped, label: labels[clamped] };
}

export const JOIN_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{5}$/;

export function normaliseJoinCode(value: string): string {
  return value.toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 5);
}

export function validateJoinCode(value: string): string | null {
  const code = normaliseJoinCode(value);
  if (code.length !== 5) return 'Lobby codes are 5 characters.';
  if (!JOIN_CODE_PATTERN.test(code)) return 'That code contains characters we never use.';
  return null;
}

export function clampMessage(value: string, max = 240): string {
  return value.slice(0, max);
}
