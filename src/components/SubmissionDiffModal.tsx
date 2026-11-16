import { X, ArrowLeftRight } from 'lucide-react';
import { SubmissionVerdictText } from './StatusText';
import type { SubmissionRecord } from '../lib/api';

interface SubmissionDiffModalProps {
  left: SubmissionRecord | null;
  right: SubmissionRecord | null;
  onClose: () => void;
}

export function SubmissionDiffModal({ left, right, onClose }: SubmissionDiffModalProps) {
  if (!left || !right) return null;

  const leftLines = left.source_code.split('\n');
  const rightLines = right.source_code.split('\n');
  const maxLines = Math.max(leftLines.length, rightLines.length);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-5xl rounded-lg border border-zinc-800 bg-[#14171D] overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
            <ArrowLeftRight className="h-4 w-4 text-blue-400" />
            Compare Submission #{left.id} vs #{right.id}
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Summary Comparison Bar */}
        <div className="grid grid-cols-2 border-b border-zinc-800 bg-[#0F1218] text-xs shrink-0">
          {[left, right].map((sub, idx) => (
            <div
              key={sub.id}
              className={`px-4 py-3 space-y-1 ${idx === 0 ? 'border-r border-zinc-800' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-zinc-300">Attempt #{sub.id}</span>
                <SubmissionVerdictText status={sub.status} />
              </div>
              <div className="text-[11px] text-zinc-400 font-mono tabular-nums flex flex-wrap gap-3">
                <span>
                  {sub.passed_count}/{sub.total_count} passed
                </span>
                <span>{sub.execution_time_ms}ms</span>
                <span>{sub.hints_used ?? 0} hints</span>
                <span>{new Date(sub.created_at + 'Z').toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Line-by-line Side-by-Side Diff */}
        <div className="flex-1 overflow-y-auto bg-[#0B0D11] font-mono text-[11px]">
          <div className="grid grid-cols-2">
            <div className="border-r border-zinc-800/80 divide-y divide-zinc-900/60">
              {Array.from({ length: maxLines }).map((_, i) => {
                const lineA = leftLines[i] ?? '';
                const lineB = rightLines[i] ?? '';
                const changed = lineA !== lineB;
                return (
                  <div
                    key={`l-${i}`}
                    className={`flex items-start px-3 py-0.5 ${
                      changed ? 'bg-rose-500/10 text-rose-200' : 'text-zinc-300'
                    }`}
                  >
                    <span className="w-7 text-right pr-2.5 text-zinc-600 select-none tabular-nums shrink-0">
                      {i < leftLines.length ? i + 1 : ''}
                    </span>
                    <span className="whitespace-pre-wrap break-all">{lineA || ' '}</span>
                  </div>
                );
              })}
            </div>
            <div className="divide-y divide-zinc-900/60">
              {Array.from({ length: maxLines }).map((_, i) => {
                const lineA = leftLines[i] ?? '';
                const lineB = rightLines[i] ?? '';
                const changed = lineA !== lineB;
                return (
                  <div
                    key={`r-${i}`}
                    className={`flex items-start px-3 py-0.5 ${
                      changed ? 'bg-emerald-500/10 text-emerald-200' : 'text-zinc-300'
                    }`}
                  >
                    <span className="w-7 text-right pr-2.5 text-zinc-600 select-none tabular-nums shrink-0">
                      {i < rightLines.length ? i + 1 : ''}
                    </span>
                    <span className="whitespace-pre-wrap break-all">{lineB || ' '}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
