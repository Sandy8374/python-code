import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bug, Play, CheckCircle2, HelpCircle } from 'lucide-react';
import { Layout } from '../components/Layout';
import { DifficultyText, ProgressStatusText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { apiFetch, type DebuggingOverviewResponse } from '../lib/api';

export function DebuggingPage() {
  const { user } = useAuth();
  const [difficultyFilter, setDifficultyFilter] = useState('');

  const query = useQuery({
    queryKey: ['debugging-overview', user?.id ?? 'anon'],
    queryFn: () => apiFetch<DebuggingOverviewResponse>('/api/debugging/overview'),
  });

  const stats = query.data?.stats;
  const questions = (query.data?.questions ?? []).filter(
    (q) => !difficultyFilter || q.difficulty === difficultyFilter
  );

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
              <Bug className="h-5 w-5 text-rose-400" />
              Python Debugging Lab
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Diagnose and repair intentionally broken Python snippets covering mutable defaults, closure capture, async coroutines, floats, and recursion.
            </p>
          </div>
          <select
            value={difficultyFilter}
            onChange={(e) => setDifficultyFilter(e.target.value)}
            className="rounded-md border border-zinc-800 bg-[#11141B] px-3 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none shrink-0"
          >
            <option value="">All Difficulties</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </div>

        {/* Debugging KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
            <div className="text-xs text-zinc-400">Debugging Solved</div>
            <div className="text-xl font-mono font-semibold text-emerald-400 tabular-nums mt-1">
              {stats?.solved ?? 0} / {stats?.total ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
            <div className="text-xs text-zinc-400">In Progress</div>
            <div className="text-xl font-mono font-semibold text-amber-400 tabular-nums mt-1">
              {stats?.attempted ?? 0}
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
            <div className="text-xs text-zinc-400">Fix Accuracy</div>
            <div className="text-xl font-mono font-semibold text-blue-400 tabular-nums mt-1">
              {stats?.accuracy_pct ?? 0}%
            </div>
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
            <div className="text-xs text-zinc-400">Debugging Submissions</div>
            <div className="text-xl font-mono font-semibold text-zinc-200 tabular-nums mt-1">
              {stats?.accepted_count ?? 0} / {stats?.submissions_count ?? 0}
            </div>
          </div>
        </div>

        {/* Challenge Table */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Debugging Challenges ({questions.length})</h2>
            <span className="text-xs text-zinc-500">Fix broken starter code &amp; pass all hidden unit tests</span>
          </div>

          {query.isLoading ? (
            <div className="p-6 space-y-2.5">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 rounded bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {questions.map((q) => (
                <div
                  key={q.id}
                  className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/25 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-medium text-white">
                      {q.status === 'Solved' ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      ) : (
                        <Bug className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                      )}
                      <span className="font-mono text-zinc-500 tabular-nums">#{q.question_number}</span>
                      <Link to={`/problems/${q.slug}`} className="hover:text-blue-400 truncate">
                        {q.title}
                      </Link>
                    </div>
                    <div className="text-[11px] text-zinc-500 mt-0.5 pl-5 flex flex-wrap items-center gap-2">
                      <span>{q.concept_name}</span>
                      <span>·</span>
                      <DifficultyText difficulty={q.difficulty} />
                      {q.attempts_count > 0 && (
                        <span className="font-mono tabular-nums">· {q.attempts_count} attempts</span>
                      )}
                      {q.hints_used_count > 0 && (
                        <span className="inline-flex items-center gap-1 text-amber-400 font-mono tabular-nums">
                          · <HelpCircle className="h-3 w-3" /> {q.hints_used_count} hints
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0">
                    <ProgressStatusText status={q.status} />
                    <Link
                      to={`/problems/${q.slug}`}
                      className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap"
                    >
                      <Play className="h-3 w-3" />
                      Debug Code
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
