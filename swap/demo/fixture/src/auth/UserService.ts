import type { User, AuthResult, LoginCredentials, AuthToken } from '../types/auth.js';

// Simple in-memory store for demo purposes
const users: Map<string, User> = new Map();
const tokens: Map<string, AuthToken> = new Map();

export function createUser(email: string, passwordHash: string, role: User['role'] = 'user'): User {
  const user: User = {
    id: Math.random().toString(36).slice(2),
    email,
    passwordHash,
    role,
    createdAt: new Date(),
  };
  users.set(user.id, user);
  return user;
}

export function findUserByEmail(email: string): User | undefined {
  return Array.from(users.values()).find((u) => u.email === email);
}

export function authenticate(email: string, password: string): AuthResult {
  const user = findUserByEmail(email);
  if (!user) {
    return { success: false, error: 'User not found' };
  }

  // Simplified password check — in production use bcrypt
  if (user.passwordHash !== password) {
    return { success: false, error: 'Invalid credentials' };
  }

  const token: AuthToken = {
    userId: user.id,
    token: Math.random().toString(36).slice(2),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    scopes: ['read', 'write'],
  };

  tokens.set(token.token, token);
  user.lastLogin = new Date();

  return { success: true, token };
}

export function login(credentials: LoginCredentials): AuthResult {
  return authenticate(credentials.email, credentials.password);
}

export function logout(tokenStr: string): boolean {
  return tokens.delete(tokenStr);
}

export function resetPassword(userId: string, newPasswordHash: string): boolean {
  const user = users.get(userId);
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
