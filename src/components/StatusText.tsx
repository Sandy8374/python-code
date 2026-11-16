import { CheckCircle2, Circle, Clock, RotateCcw, AlertTriangle, XCircle } from 'lucide-react';
import type { Difficulty, ProgressStatus, RevisionPriority, SubmissionStatus } from '../lib/api';

export function DifficultyText({ difficulty }: { difficulty: Difficulty | string }) {
  const color =
    difficulty === 'Easy'
      ? 'text-emerald-400'
      : difficulty === 'Medium'
      ? 'text-amber-400'
      : 'text-rose-400';

  return <span className={`text-xs font-medium tracking-tight ${color}`}>{difficulty}</span>;
}

export function ProgressStatusText({ status }: { status: ProgressStatus | string }) {
  if (status === 'Solved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Solved
      </span>
    );
  }
  if (status === 'Attempted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-400 whitespace-nowrap">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        Attempted
      </span>
    );
  }
  if (status === 'Needs Revision') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-400 whitespace-nowrap">
        <RotateCcw className="h-3.5 w-3.5 shrink-0" />
        Needs Revision
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500 whitespace-nowrap">
      <Circle className="h-3.5 w-3.5 shrink-0" />
      Not Started
    </span>
  );
}

export function SubmissionVerdictText({ status }: { status: SubmissionStatus | string }) {
  if (status === 'Accepted') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 whitespace-nowrap">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
        Accepted
      </span>
    );
  }
  if (status === 'Wrong Answer') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-rose-400 whitespace-nowrap">
        <XCircle className="h-3.5 w-3.5 shrink-0" />
        Wrong Answer
      </span>
    );
  }
  if (status === 'Time Limit Exceeded' || status === 'Memory Limit Exceeded') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 whitespace-nowrap">
        <Clock className="h-3.5 w-3.5 shrink-0" />
        {status}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-400 whitespace-nowrap">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      {status}
    </span>
  );
}

export function PriorityText({ priority }: { priority: RevisionPriority | string }) {
  const cls =
    priority === 'High'
      ? 'text-rose-400'
      : priority === 'Medium'
      ? 'text-amber-400'
      : 'text-zinc-400';
  return <span className={`text-xs font-medium ${cls}`}>{priority}</span>;
}
