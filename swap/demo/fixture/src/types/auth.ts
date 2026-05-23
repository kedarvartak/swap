export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'user' | 'guest';
  createdAt: Date;
  lastLogin?: Date;
}

export interface AuthToken {
  userId: string;
  token: string;
  expiresAt: Date;
  scopes: string[];
}

export interface AuthResult {
  success: boolean;
  token?: AuthToken;
  error?: string;
}

export interface LoginCredentials {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  blockDurationMs: number;
}

export interface UserStore {
  get(id: string): User | undefined;
  set(id: string, user: User): void;
  values(): IterableIterator<User>;
}
