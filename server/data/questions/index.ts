import type { QuestionSeed } from '../../types.ts';
import { BATCH_1_QUESTIONS } from './batch1.ts';
import { BATCH_2_QUESTIONS } from './batch2.ts';
import { BATCH_3_QUESTIONS } from './batch3.ts';
import { BATCH_4_QUESTIONS } from './batch4.ts';
import { BATCH_5_QUESTIONS } from './batch5.ts';
import { BATCH_6_DEBUGGING_QUESTIONS } from './batch6_debugging.ts';

export const ALL_QUESTIONS: QuestionSeed[] = [
  ...BATCH_1_QUESTIONS,
  ...BATCH_2_QUESTIONS,
  ...BATCH_3_QUESTIONS,
  ...BATCH_4_QUESTIONS,
  ...BATCH_5_QUESTIONS,
  ...BATCH_6_DEBUGGING_QUESTIONS,
];
