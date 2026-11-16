import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'python-mastery-dev-jwt-secret-key-2026';
const TOKEN_EXPIRY = '7d';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  full_name: string;
  role: string;
  bio: string;
  target_role: string;
  avatar_url: string;
  created_at: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, 10);
}

export function verifyPassword(password: string, hash: string): boolean {
  return bcrypt.compareSync(password, hash);
}

export function signToken(userId: number, email: string): string {
  return jwt.sign({ sub: userId, email }, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { sub: number; email: string } | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as unknown as { sub: number; email: string };
    return decoded;
  } catch {
    return null;
  }
}

function getUserById(id: number): AuthUser | undefined {
  const row = db
    .prepare(
      'SELECT id, username, email, full_name, role, bio, target_role, avatar_url, created_at FROM users WHERE id = ?'
    )
    .get(id) as AuthUser | undefined;
  return row;
}

export function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    const payload = verifyToken(token);
    if (payload) {
      const user = getUserById(Number(payload.sub));
      if (user) {
        req.user = user;
      }
    }
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ detail: 'Authentication required. Please sign in.' });
    return;
  }
  const token = authHeader.slice(7).trim();
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ detail: 'Invalid or expired authentication token.' });
    return;
  }
  const user = getUserById(Number(payload.sub));
  if (!user) {
    res.status(401).json({ detail: 'User account not found.' });
    return;
  }
  req.user = user;
  next();
}
