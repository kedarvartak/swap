import { authenticate } from '../auth/UserService.js';
import type { RateLimitConfig, AuthResult } from '../types/auth.js';

interface AttemptRecord {
  count: number;
  windowStart: number;
  blockedUntil?: number;
}

const attempts: Map<string, AttemptRecord> = new Map();

const DEFAULT_CONFIG: RateLimitConfig = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,   // 15 minutes
  blockDurationMs: 60 * 60 * 1000, // 1 hour
};

export function checkRateLimit(identifier: string, config = DEFAULT_CONFIG): boolean {
  const now = Date.now();
  const record = attempts.get(identifier);

  if (!record) return true;

  if (record.blockedUntil && now < record.blockedUntil) {
    return false;
  }

  if (now - record.windowStart > config.windowMs) {
    attempts.delete(identifier);
    return true;
  }

  return record.count < config.maxAttempts;
}

export function recordAttempt(identifier: string, success: boolean, config = DEFAULT_CONFIG): void {
  const now = Date.now();
  const record = attempts.get(identifier) ?? { count: 0, windowStart: now };

  if (now - record.windowStart > config.windowMs) {
    record.count = 0;
    record.windowStart = now;
    delete record.blockedUntil;
  }

  if (!success) {
    record.count++;
    if (record.count >= config.maxAttempts) {
      record.blockedUntil = now + config.blockDurationMs;
    }
  } else {
    record.count = 0;
    delete record.blockedUntil;
  }

  attempts.set(identifier, record);
}

// Thin wrapper — rate limit logic now lives inside authenticate() itself.
export function authenticateWithRateLimit(
  email: string,
  password: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): AuthResult {
  return authenticate(email, password, config);
}
