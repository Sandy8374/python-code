import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.ts';
import { hashPassword, requireAuth, signToken, verifyPassword, type AuthenticatedRequest } from '../auth.ts';

const router = Router();

const registerSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().trim().email().max(120),
  full_name: z.string().trim().min(2).max(80),
  password: z.string().min(6).max(128),
  target_role: z.string().trim().max(80).optional(),
});

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

router.post('/register', (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.issues[0]?.message || 'Invalid registration payload' });
    return;
  }

  const { username, email, full_name, password, target_role } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = db
    .prepare('SELECT id FROM users WHERE lower(email) = ? OR lower(username) = ?')
    .get(normalizedEmail, username.toLowerCase()) as { id: number } | undefined;

  if (existing) {
    res.status(409).json({ detail: 'An account with this email or username already exists.' });
    return;
  }

  const passwordHash = hashPassword(password);
  const result = db
    .prepare(
      `INSERT INTO users (username, email, full_name, password_hash, target_role)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(username, normalizedEmail, full_name, passwordHash, target_role || 'Python Backend Engineer');

  const userId = Number(result.lastInsertRowid);
  const user = db
    .prepare(
      'SELECT id, username, email, full_name, role, bio, target_role, avatar_url, created_at FROM users WHERE id = ?'
    )
    .get(userId);

  const token = signToken(userId, normalizedEmail);
  res.status(201).json({ access_token: token, token, token_type: 'bearer', user });
});

router.post('/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: 'Email/username and password are required.' });
    return;
  }

  const { identifier, password } = parsed.data;
  const cleanId = identifier.toLowerCase();
  const row = db
    .prepare(
      `SELECT id, username, email, full_name, password_hash, role, bio, target_role, avatar_url, created_at
       FROM users WHERE lower(email) = ? OR lower(username) = ?`
    )
    .get(cleanId, cleanId) as
    | {
        id: number;
        username: string;
        email: string;
        full_name: string;
        password_hash: string;
        role: string;
        bio: string;
        target_role: string;
        avatar_url: string;
        created_at: string;
      }
    | undefined;

  if (!row || !verifyPassword(password, row.password_hash)) {
    res.status(401).json({ detail: 'Invalid credentials.' });
    return;
  }

  const token = signToken(row.id, row.email);
  const { password_hash: _, ...safeUser } = row;
  res.json({ access_token: token, token, token_type: 'bearer', user: safeUser });
});

router.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({ user: req.user });
});

router.post('/logout', requireAuth, (_req, res) => {
  res.json({ ok: true, message: 'Signed out successfully.' });
});

router.put('/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    full_name: z.string().trim().min(2).max(80),
    bio: z.string().trim().max(400).optional(),
    target_role: z.string().trim().min(2).max(80).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.issues[0]?.message || 'Invalid profile update' });
    return;
  }

  db.prepare(
    `UPDATE users SET full_name = ?, bio = ?, target_role = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(
    parsed.data.full_name,
    parsed.data.bio ?? req.user!.bio,
    parsed.data.target_role ?? req.user!.target_role,
    req.user!.id
  );

  const updated = db
    .prepare(
      'SELECT id, username, email, full_name, role, bio, target_role, avatar_url, created_at FROM users WHERE id = ?'
    )
    .get(req.user!.id);
  res.json({ user: updated });
});

router.put('/password', requireAuth, (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    current_password: z.string().min(1),
    new_password: z.string().min(6).max(128),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ detail: parsed.error.issues[0]?.message || 'Invalid password payload' });
    return;
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user!.id) as {
    password_hash: string;
  };
  if (!verifyPassword(parsed.data.current_password, row.password_hash)) {
    res.status(400).json({ detail: 'Current password is incorrect.' });
    return;
  }

  db.prepare(`UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?`).run(
    hashPassword(parsed.data.new_password),
    req.user!.id
  );
  res.json({ ok: true, message: 'Password updated.' });
});

export default router;
