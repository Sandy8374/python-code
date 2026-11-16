import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Map as MapIcon, ChevronDown, ChevronRight, ArrowRight, AlertTriangle, CheckCircle2, Compass } from 'lucide-react';
import { Layout } from '../components/Layout';
import { DifficultyText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { apiFetch, type RoadmapResponse } from '../lib/api';

export function RoadmapPage() {
  const { user } = useAuth();
  const [expandedModules, setExpandedModules] = useState<Record<number, boolean>>({});

  const query = useQuery({
    queryKey: ['roadmap', user?.id ?? 'anon'],
    queryFn: () => apiFetch<RoadmapResponse>('/api/roadmap'),
  });

  const data = query.data;

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
            <MapIcon className="h-5 w-5 text-blue-400" />
            Personal Python Mastery Roadmap
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Structured 21-module curriculum progression computed directly from your solved exercises, failed attempts, and hint usage.
          </p>
        </div>

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
              <div className="text-xs text-zinc-400">Overall Completion</div>
              <div className="text-2xl font-mono font-semibold text-white tabular-nums mt-1">
                {data.summary.overall_pct}%
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5 font-mono tabular-nums">
                {data.summary.questions_solved} / {data.summary.questions_total} problems
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
              <div className="text-xs text-zinc-400">Modules Completed</div>
              <div className="text-2xl font-mono font-semibold text-emerald-400 tabular-nums mt-1">
                {data.summary.modules_completed} / {data.summary.modules_total}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Full Python tracks</div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
              <div className="text-xs text-zinc-400">Concepts Mastered</div>
              <div className="text-2xl font-mono font-semibold text-blue-400 tabular-nums mt-1">
                {data.summary.concepts_completed} / {data.summary.concepts_total}
              </div>
              <div className="text-[11px] text-zinc-500 mt-0.5">Topic milestones</div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4 space-y-1.5">
              <div className="text-xs text-zinc-400">Difficulty Progress</div>
              {data.difficulty_progress.map((d) => (
                <div key={d.difficulty} className="flex items-center justify-between text-[11px]">
                  <DifficultyText difficulty={d.difficulty} />
                  <span className="font-mono text-zinc-300 tabular-nums">
                    {d.solved}/{d.total} ({d.pct}%)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommended Next & Weak Concepts */}
        {data && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center gap-2">
                <Compass className="h-4 w-4 text-blue-400" />
                <h2 className="text-sm font-semibold text-white">Recommended Next Concepts</h2>
              </div>
              <div className="divide-y divide-zinc-800/60">
                {data.recommended_next_concepts.map((c) => (
                  <Link
                    key={c.id}
                    to={`/problems?concept=${encodeURIComponent(c.slug)}`}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-800/25 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-white truncate">{c.name}</div>
                      <div className="text-[11px] text-zinc-500 truncate">{c.category_name}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 font-mono text-zinc-300 tabular-nums">
                      <span>
                        {c.solved_count}/{c.total_count}
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 text-blue-400" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-white">Weak Concepts (Failed Attempts / Hints)</h2>
              </div>
              {data.weak_concepts.length === 0 ? (
                <div className="p-6 text-xs text-zinc-500">
                  No weak concepts flagged yet. Concepts with failed submissions or frequent hint usage appear here for targeted review.
                </div>
              ) : (
                <div className="divide-y divide-zinc-800/60">
                  {data.weak_concepts.map((c) => (
                    <Link
                      key={c.id}
                      to={`/problems?concept=${encodeURIComponent(c.slug)}`}
                      className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-800/25 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{c.name}</div>
                        <div className="text-[11px] text-zinc-500 truncate">{c.category_name}</div>
                      </div>
                      <div className="text-right font-mono text-[11px] shrink-0 tabular-nums">
                        <span className="text-rose-400">{c.failed_subs} fails</span>
                        <span className="text-zinc-600 mx-1.5">·</span>
                        <span className="text-amber-400">{c.hints_used} hints</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Interactive 21-Module Curriculum Tree */}
        <div className="space-y-2.5">
          <h2 className="text-sm font-semibold text-white">21 Python Curriculum Modules</h2>
          {query.isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 rounded-lg border border-zinc-800 bg-[#11141B] animate-pulse" />
            ))
          ) : (
            (data?.modules ?? []).map((mod) => {
              const open = Boolean(expandedModules[mod.id]);
              return (
                <div key={mod.id} className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setExpandedModules((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-4 hover:bg-zinc-800/25 text-left transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {open ? (
                        <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white flex items-center gap-2">
                          <span className="font-mono text-zinc-500 tabular-nums">
                            {String(mod.order_index).padStart(2, '0')}
                          </span>
                          <span className="truncate">{mod.name}</span>
                          {mod.is_completed && <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />}
                        </div>
                        <div className="text-xs text-zinc-500 truncate mt-0.5">{mod.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 shrink-0">
                      <div className="hidden sm:block w-28 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 transition-all"
                          style={{ width: `${mod.completion_pct}%` }}
                        />
                      </div>
                      <span className="font-mono text-xs text-zinc-300 tabular-nums w-24 text-right">
                        {mod.solved_count}/{mod.total_count} ({mod.completion_pct}%)
                      </span>
                    </div>
                  </button>

                  {open && (
                    <div className="border-t border-zinc-800/70 bg-[#0B0D11] divide-y divide-zinc-800/60">
                      {mod.concepts.map((con) => (
                        <Link
                          key={con.id}
                          to={`/problems?concept=${encodeURIComponent(con.slug)}`}
                          className="px-6 py-3 flex items-center justify-between gap-3 hover:bg-zinc-800/25 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-medium text-zinc-200 flex items-center gap-2">
                              {con.is_completed && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />}
                              <span>{con.name}</span>
                            </div>
                            <div className="text-[11px] text-zinc-500 truncate mt-0.5">{con.summary}</div>
                          </div>
                          <span className="font-mono text-zinc-400 tabular-nums shrink-0">
                            {con.solved_count}/{con.total_count} solved
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
