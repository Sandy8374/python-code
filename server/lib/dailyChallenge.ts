import { db } from '../db.ts';

export function getTodayUtcDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyChallengeQuestionId(dateStr = getTodayUtcDate()): number | null {
  const rows = db.prepare('SELECT id FROM questions ORDER BY question_number ASC').all() as { id: number }[];
  if (rows.length === 0) return null;

  // FNV-1a deterministic 32-bit hash over YYYY-MM-DD so everyone gets the same daily challenge
  let hash = 2166136261;
  for (let i = 0; i < dateStr.length; i++) {
    hash ^= dateStr.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const index = (hash >>> 0) % rows.length;
  return rows[index].id;
}
