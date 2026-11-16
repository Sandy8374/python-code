import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Code2, X, ArrowLeftRight } from 'lucide-react';
import { Layout } from '../components/Layout';
import { DifficultyText, SubmissionVerdictText } from '../components/StatusText';
import { SubmissionDiffModal } from '../components/SubmissionDiffModal';
import { useAuth } from '../context/AuthContext';
import { apiFetch, type SubmissionRecord } from '../lib/api';

export function SubmissionsPage() {
  const { user, openAuthModal } = useAuth();
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [inspecting, setInspecting] = useState<SubmissionRecord | null>(null);
  const [compareIds, setCompareIds] = useState<number[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const query = useQuery({
    queryKey: ['submissions', user?.id, statusFilter, page],
    queryFn: () => {
      const p = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter) p.set('status', statusFilter);
      return apiFetch<{
        submissions: SubmissionRecord[];
        total: number;
        page: number;
        total_pages: number;
      }>(`/api/submissions?${p.toString()}`);
    },
    enabled: Boolean(user),
  });

  if (!user) {
    return (
      <Layout>
        <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-8 text-center space-y-3 max-w-lg mx-auto mt-10">
          <h1 className="text-lg font-semibold text-white">My Submissions</h1>
          <p className="text-xs text-zinc-400">
            Sign in to view your historical Python submissions, test pass ratios, runtimes, hints used, and side-by-side diffs.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white"
          >
            Sign In to View History
          </button>
        </div>
      </Layout>
    );
  }

  const submissions = query.data?.submissions ?? [];
  const compareLeft = submissions.find((s) => s.id === compareIds[0]) ?? null;
  const compareRight = submissions.find((s) => s.id === compareIds[1]) ?? null;

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">My Submissions</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              All persisted Python execution runs, verdicts, hints used, and side-by-side attempt comparison for @{user.username}.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={compareIds.length !== 2}
              onClick={() => setCompareOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-40 px-3 py-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 text-blue-400" />
              Compare ({compareIds.length}/2)
            </button>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
                setCompareIds([]);
              }}
              className="rounded-md border border-zinc-800 bg-[#11141B] px-3 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="">All Verdicts</option>
              <option value="Accepted">Accepted</option>
              <option value="Wrong Answer">Wrong Answer</option>
              <option value="Runtime Error">Runtime Error</option>
              <option value="Time Limit Exceeded">Time Limit Exceeded</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
          {query.isLoading ? (
            <div className="p-6 space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 rounded bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : submissions.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm text-zinc-300">No submissions recorded yet.</p>
              <Link to="/problems" className="text-xs text-blue-400 hover:text-blue-300">
                Solve a Python exercise →
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500 bg-[#0F1218]">
                    <th className="py-3 pl-4 pr-2 font-medium w-8">Cmp</th>
                    <th className="py-3 px-4 font-medium">Exercise</th>
                    <th className="py-3 px-4 font-medium">Verdict</th>
                    <th className="py-3 px-4 font-medium text-right">Tests</th>
                    <th className="py-3 px-4 font-medium text-right">Hints</th>
                    <th className="py-3 px-4 font-medium text-right">Runtime</th>
                    <th className="py-3 px-4 font-medium">Submitted</th>
                    <th className="py-3 px-4 font-medium text-right">Code</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-xs">
                  {submissions.map((sub) => {
                    const checked = compareIds.includes(sub.id);
                    return (
                      <tr key={sub.id} className="hover:bg-zinc-800/30 transition-colors">
                        <td className="py-3 pl-4 pr-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            aria-label={`Select submission #${sub.id} to compare`}
                            onChange={() => {
                              setCompareIds((prev) =>
                                prev.includes(sub.id)
                                  ? prev.filter((x) => x !== sub.id)
                                  : prev.length >= 2
                                  ? [prev[1], sub.id]
                                  : [...prev, sub.id]
                              );
                            }}
                            className="rounded border-zinc-700 bg-zinc-900 accent-blue-600"
                          />
                        </td>
                        <td className="py-3 px-4">
                          <Link
                            to={`/problems/${sub.question_slug}`}
                            className="font-medium text-zinc-100 hover:text-blue-400"
                          >
                            <span className="font-mono text-zinc-500 mr-1.5 tabular-nums">#{sub.question_number}</span>
                            {sub.question_title}
                          </Link>
                          <div className="text-[11px] text-zinc-500 mt-0.5">
                            {sub.category_name} · <DifficultyText difficulty={sub.difficulty || 'Easy'} />
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <SubmissionVerdictText status={sub.status} />
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-300">
                          {sub.passed_count}/{sub.total_count}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-400">
                          {sub.hints_used ?? 0}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-zinc-400">
                          {sub.execution_time_ms}ms
                        </td>
                        <td className="py-3 px-4 text-zinc-400 whitespace-nowrap">
                          {new Date(sub.created_at + 'Z').toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => setInspecting(sub)}
                            className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                          >
                            <Code2 className="h-3.5 w-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {query.data && query.data.total_pages > 1 && (
            <div className="px-4 py-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
              <span className="font-mono tabular-nums">
                Page {query.data.page} of {query.data.total_pages}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= query.data.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Code Inspection Modal */}
        {inspecting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-2xl rounded-lg border border-zinc-800 bg-[#14171D] overflow-hidden shadow-2xl">
              <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <SubmissionVerdictText status={inspecting.status} />
                  <span className="text-xs font-medium text-zinc-200">
                    #{inspecting.question_number} {inspecting.question_title}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                    · {inspecting.hints_used ?? 0} hints used
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setInspecting(null)}
                  className="p-1 text-zinc-400 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-3 max-h-[75vh] overflow-y-auto">
                {inspecting.error_output && (
                  <pre className="rounded border border-rose-500/30 bg-rose-500/10 p-3 font-mono text-xs text-rose-300 whitespace-pre-wrap">
                    {inspecting.error_output}
                  </pre>
                )}
                <pre className="rounded border border-zinc-800 bg-[#0B0D11] p-4 font-mono text-xs text-zinc-200 overflow-x-auto">
                  {inspecting.source_code}
                </pre>
              </div>
            </div>
          </div>
        )}

        {compareOpen && compareLeft && compareRight && (
          <SubmissionDiffModal
            left={compareLeft}
            right={compareRight}
            onClose={() => setCompareOpen(false)}
          />
        )}
      </div>
    </Layout>
  );
}
