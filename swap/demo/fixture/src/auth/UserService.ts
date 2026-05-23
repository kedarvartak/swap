import type { User, AuthResult, LoginCredentials, AuthToken, RateLimitConfig, UserStore } from '../types/auth.js';
import { checkRateLimit, recordAttempt } from '../middleware/rateLimit.js';

const tokens: Map<string, AuthToken> = new Map();

// Default in-memory store — callers may inject an alternative via the store parameter
const defaultStore: UserStore = new Map<string, User>();

export function createUser(
  email: string,
  passwordHash: string,
  role: User['role'] = 'user',
  store: UserStore = defaultStore,
): User {
  const user: User = {
    id: Math.random().toString(36).slice(2),
    email,
    passwordHash,
    role,
    createdAt: new Date(),
  };
  store.set(user.id, user);
  return user;
}

export function findUserByEmail(email: string, store: UserStore = defaultStore): User | undefined {
  return Array.from(store.values()).find((u) => u.email === email);
}

export function authenticate(email: string, password: string, rateLimitConfig?: RateLimitConfig): AuthResult {
  if (rateLimitConfig && !checkRateLimit(email, rateLimitConfig)) {
    return { success: false, error: 'Too many failed attempts. Try again later.' };
  }

  const user = findUserByEmail(email);
  if (!user) {
    const result: AuthResult = { success: false, error: 'User not found' };
    if (rateLimitConfig) recordAttempt(email, false, rateLimitConfig);
    return result;
  }

  // Simplified password check — in production use bcrypt
  if (user.passwordHash !== password) {
    const result: AuthResult = { success: false, error: 'Invalid credentials' };
    if (rateLimitConfig) recordAttempt(email, false, rateLimitConfig);
    return result;
  }

  const token: AuthToken = {
    userId: user.id,
    token: Math.random().toString(36).slice(2),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    scopes: ['read', 'write'],
  };

  tokens.set(token.token, token);
  user.lastLogin = new Date();

  if (rateLimitConfig) recordAttempt(email, true, rateLimitConfig);
  return { success: true, token };
}

export function login(credentials: LoginCredentials, rateLimitConfig?: RateLimitConfig): AuthResult {
  return authenticate(credentials.email, credentials.password, rateLimitConfig);
}

export function logout(tokenStr: string): boolean {
  return tokens.delete(tokenStr);
}

export function resetPassword(userId: string, newPasswordHash: string, store: UserStore = defaultStore): boolean {
  const user = store.get(userId);
  if (!user) return false;
  user.passwordHash = newPasswordHash;
  return true;
}

export function validateToken(tokenStr: string): AuthToken | null {
  const token = tokens.get(tokenStr);
  if (!token) return null;
  if (token.expiresAt < new Date()) {
    tokens.delete(tokenStr);
    return null;
  }
  return token;
}

export function revokeAllTokens(userId: string): number {
  let count = 0;
  for (const [key, token] of tokens) {
    if (token.userId === userId) {
      tokens.delete(key);
      count++;
    }
  }
  return count;
}
