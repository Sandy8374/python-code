import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Layout } from '../components/Layout';
import { DifficultyText, ProgressStatusText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  type ActivityPoint,
  type DetailedAnalyticsResponse,
} from '../lib/api';

export function AnalyticsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);

  const detailedQuery = useQuery({
    queryKey: ['analytics-detailed', user?.id ?? 'anon'],
    queryFn: () => apiFetch<DetailedAnalyticsResponse>('/api/analytics/detailed'),
  });

  const activityQuery = useQuery({
    queryKey: ['analytics-activity', days, user?.id ?? 'anon'],
    queryFn: () => apiFetch<{ activity: ActivityPoint[] }>(`/api/analytics/activity?days=${days}`),
  });

  const detailed = detailedQuery.data;
  const overview = detailed?.overview;
  const activity = activityQuery.data?.activity ?? [];
  const categories = detailed?.category_performance ?? [];
  const diffSuccess = detailed?.difficulty_success ?? [];
  const weeklyActivity = detailed?.weekly_activity ?? [];
  const hintStats = detailed?.hint_stats;
  const revStats = detailed?.revision_stats;
  const mockStats = detailed?.mock_interview_stats;
  const failedQuestions = detailed?.failed_questions ?? [];

  const diffChartData = overview
    ? [
        {
          level: 'Easy',
          solved: overview.difficulty.Easy.solved,
          remaining: overview.difficulty.Easy.total - overview.difficulty.Easy.solved,
        },
        {
          level: 'Medium',
          solved: overview.difficulty.Medium.solved,
          remaining: overview.difficulty.Medium.total - overview.difficulty.Medium.solved,
        },
        {
          level: 'Hard',
          solved: overview.difficulty.Hard.solved,
          remaining: overview.difficulty.Hard.total - overview.difficulty.Hard.solved,
        },
      ]
    : [];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Mastery Analytics</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Category accuracy, difficulty success rates, hint usage, spaced revision telemetry, and mock interview scores across all 21 modules.
            </p>
          </div>
          <div className="inline-flex rounded-md border border-zinc-800 bg-[#11141B] p-1 shrink-0">
            {[14, 30, 60].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDays(d)}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                  days === d ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-white'
                }`}
              >
                {d}D
              </button>
            ))}
          </div>
        </div>

        {/* Summary Metrics */}
        {overview && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
              <div className="text-xs text-zinc-400">Overall Mastery</div>
              <div className="text-2xl font-mono font-semibold text-white tabular-nums mt-1">
                {overview.mastery_percentage}%
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
              <div className="text-xs text-zinc-400">Solved Questions</div>
              <div className="text-2xl font-mono font-semibold text-emerald-400 tabular-nums mt-1">
                {overview.solved_questions} / {overview.total_questions}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
              <div className="text-xs text-zinc-400">Independent vs Hinted</div>
              <div className="text-2xl font-mono font-semibold text-blue-400 tabular-nums mt-1">
                {hintStats?.solved_independently ?? 0} / {hintStats?.solved_with_hints ?? 0}
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
              <div className="text-xs text-zinc-400">Mock Interview Avg</div>
              <div className="text-2xl font-mono font-semibold text-zinc-100 tabular-nums mt-1">
                {mockStats?.avg_score_pct ?? 0}%
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
              <div className="text-xs text-zinc-400">Revisions Due</div>
              <div className="text-2xl font-mono font-semibold text-amber-400 tabular-nums mt-1">
                {revStats?.due_now ?? 0} / {revStats?.total_queued ?? 0}
              </div>
            </div>
          </div>
        )}

        {/* Daily & Weekly Activity Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-lg border border-zinc-800/80 bg-[#11141B] p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Practice Activity ({days}-Day Window)</h2>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={activity} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="#1e2430" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F1218',
                      borderColor: '#27272a',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#f4f4f5',
                    }}
                  />
                  <Area type="monotone" dataKey="submissions" name="Submissions" stroke="#3b82f6" fill="#3b82f622" />
                  <Area type="monotone" dataKey="solved" name="Solved" stroke="#10b981" fill="#10b98133" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-5 rounded-lg border border-zinc-800/80 bg-[#11141B] p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Weekly Coding Velocity (8 Weeks)</h2>
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyActivity} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="#1e2430" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="week" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F1218',
                      borderColor: '#27272a',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#f4f4f5',
                    }}
                  />
                  <Bar dataKey="submissions" name="Submissions" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="solved" name="Solved" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Difficulty Success Rates + Solved vs Remaining + Hint/Revision/Mock Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-4">
            <h2 className="text-sm font-semibold text-white">Difficulty Submission Accuracy</h2>
            <div className="space-y-3.5">
              {diffSuccess.map((d) => (
                <div key={d.difficulty} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <DifficultyText difficulty={d.difficulty} />
                    <span className="font-mono text-zinc-300 tabular-nums">
                      {d.accepted}/{d.submissions} accepted ({d.success_rate_pct}%)
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className={`h-full ${
                        d.difficulty === 'Easy' ? 'bg-emerald-500' : d.difficulty === 'Medium' ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${d.success_rate_pct}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 rounded-lg border border-zinc-800/80 bg-[#11141B] p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Solved vs Remaining by Tier</h2>
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={diffChartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                  <CartesianGrid stroke="#1e2430" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="level" tick={{ fill: '#a1a1aa', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0F1218',
                      borderColor: '#27272a',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#f4f4f5',
                    }}
                  />
                  <Bar dataKey="solved" name="Solved" stackId="a" fill="#10b981" />
                  <Bar dataKey="remaining" name="Remaining" stackId="a" fill="#27272a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="lg:col-span-4 rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 space-y-3 text-xs">
            <h2 className="text-sm font-semibold text-white">Hints, Revision &amp; Mock Summary</h2>
            <div className="space-y-2 text-zinc-300">
              <div className="flex justify-between">
                <span className="text-zinc-400">Total hints revealed</span>
                <span className="font-mono tabular-nums">{hintStats?.total_hints_revealed ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Solved without hints</span>
                <span className="font-mono text-emerald-400 tabular-nums">{hintStats?.solved_independently ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Revision reviews completed</span>
                <span className="font-mono tabular-nums">{revStats?.total_reviews ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Avg spaced interval</span>
                <span className="font-mono tabular-nums">{revStats?.avg_interval_days ?? 0}d</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Mock interviews completed</span>
                <span className="font-mono tabular-nums">{mockStats?.completed_count ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-400">Best mock interview score</span>
                <span className="font-mono text-blue-400 tabular-nums">{mockStats?.best_score_pct ?? 0}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Failed Questions & Recent Mock Sessions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/80">
              <h2 className="text-sm font-semibold text-white">Failed Question Analysis</h2>
            </div>
            {failedQuestions.length === 0 ? (
              <div className="p-6 text-xs text-zinc-500">No failed submissions recorded yet.</div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {failedQuestions.map((fq) => (
                  <Link
                    key={fq.id}
                    to={`/problems/${fq.slug}`}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-800/25 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-zinc-100 truncate">
                        <span className="font-mono text-zinc-500 mr-1.5 tabular-nums">#{fq.question_number}</span>
                        {fq.title}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        {fq.category_name} · <DifficultyText difficulty={fq.difficulty} />
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono text-rose-400 tabular-nums">
                        {fq.fail_count}/{fq.total_attempts} failed
                      </div>
                      <ProgressStatusText status={fq.current_status} />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Recent Mock Interview Scores</h2>
              <Link to="/mock-interview" className="text-xs text-blue-400 hover:text-blue-300">
                Start Mock Interview →
              </Link>
            </div>
            {(mockStats?.recent_sessions ?? []).length === 0 ? (
              <div className="p-6 text-xs text-zinc-500">
                No completed mock interviews yet. Launch a timed session to benchmark interview readiness.
              </div>
            ) : (
              <div className="divide-y divide-zinc-800/60">
                {mockStats!.recent_sessions.map((ms) => (
                  <div key={ms.id} className="px-4 py-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-medium text-zinc-100">
                        {ms.difficulty} · {ms.category_slug || 'All Categories'}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 font-mono tabular-nums">
                        {ms.passed_questions}/{ms.total_questions} passed · {Math.round(ms.time_spent_seconds / 60)}m spent
                      </div>
                    </div>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        ms.score_pct >= 70 ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    >
                      {ms.score_pct}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 21-Category Completion & Accuracy Breakdown */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-5">
          <h2 className="text-sm font-semibold text-white mb-4">Category-Wise Mastery &amp; Submission Accuracy (21 Modules)</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3.5">
            {categories.map((cat) => (
              <div key={cat.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-200 truncate pr-2">
                    <span className="font-mono text-zinc-500 mr-1.5 tabular-nums">
                      {String(cat.order_index).padStart(2, '0')}
                    </span>
                    {cat.name}
                  </span>
                  <span className="font-mono text-zinc-400 tabular-nums shrink-0">
                    {cat.solved_count}/{cat.total_count} ({cat.completion_pct}%)
                    {cat.submissions_count > 0 ? ` · ${cat.accuracy_pct}% acc` : ''}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all" style={{ width: `${cat.completion_pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
