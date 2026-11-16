import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { ArrowRight, Flame, CheckCircle2, Clock, Bookmark, RotateCcw, Code2, CalendarCheck } from 'lucide-react';
import { Layout } from '../components/Layout';
import { DifficultyText, ProgressStatusText, SubmissionVerdictText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  type ActivityPoint,
  type AnalyticsOverview,
  type CategorySummary,
  type DailyChallengeResponse,
} from '../lib/api';

export function DashboardPage() {
  const { user, demoLogin, openAuthModal } = useAuth();

  const overviewQuery = useQuery({
    queryKey: ['analytics-overview', user?.id ?? 'anon'],
    queryFn: () => apiFetch<AnalyticsOverview>('/api/analytics/overview'),
  });

  const activityQuery = useQuery({
    queryKey: ['analytics-activity', 14, user?.id ?? 'anon'],
    queryFn: () => apiFetch<{ activity: ActivityPoint[] }>('/api/analytics/activity?days=14'),
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories', user?.id ?? 'anon'],
    queryFn: () => apiFetch<{ categories: CategorySummary[] }>('/api/categories'),
  });

  const dailyQuery = useQuery({
    queryKey: ['daily-challenge', user?.id ?? 'anon'],
    queryFn: () => apiFetch<DailyChallengeResponse>('/api/daily-challenge'),
  });

  const overview = overviewQuery.data;
  const activity = activityQuery.data?.activity ?? [];
  const categories = categoriesQuery.data?.categories ?? [];
  const daily = dailyQuery.data;

  return (
    <Layout>
      <div className="space-y-6">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">
              {user ? `Welcome back, ${user.full_name}` : 'Python Mastery Workspace'}
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {user
                ? `${user.target_role} track · Master core, backend & GenAI Python across 21 structured modules.`
                : 'Sign in or explore 318+ practical Python exercises from fundamentals to Debugging, FastAPI & Agentic AI patterns.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!user && (
              <button
                type="button"
                onClick={() => void demoLogin()}
                className="rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-2 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0 transition-colors"
              >
                Try Demo Account
              </button>
            )}
            <Link
              to="/problems"
              className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-medium text-white whitespace-nowrap shrink-0 transition-colors"
            >
              Browse All Problems
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Auth Prompt Banner for Anonymous Visitors */}
        {!user && (
          <div className="rounded-lg border border-blue-500/25 bg-[#11141B] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-zinc-300">
              You can run public test cases right now. Sign in to submit solutions, persist code drafts, bookmark questions, and track mastery metrics.
            </div>
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap shrink-0"
            >
              Sign in or create account →
            </button>
          </div>
        )}

        {/* Today's Daily Challenge Card */}
        {daily?.question && (
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
                <span className="inline-flex items-center gap-1 text-blue-400 font-semibold">
                  <CalendarCheck className="h-3.5 w-3.5" />
                  DAILY PYTHON CHALLENGE · {daily.date}
                </span>
                <span className="text-zinc-600">·</span>
                <DifficultyText difficulty={daily.question.difficulty} />
                <span className="text-zinc-600">·</span>
                <span className={daily.is_completed ? 'text-emerald-400' : 'text-zinc-400'}>
                  {daily.is_completed ? 'Completed Today' : 'Pending Today'}
                </span>
              </div>
              <div className="text-sm font-semibold text-white truncate">
                <span className="font-mono text-zinc-500 mr-2 tabular-nums">#{daily.question.question_number}</span>
                {daily.question.title}
              </div>
              <div className="text-xs text-zinc-400 truncate">
                {daily.question.category_name} · {daily.question.concept_name}
              </div>
            </div>

            <div className="flex items-center gap-4 shrink-0">
              <div className="text-right hidden sm:block">
                <div className="text-[11px] text-zinc-500">Daily Streak</div>
                <div className="text-sm font-mono font-semibold text-orange-400 tabular-nums">
                  {daily.daily_streak}d · {daily.total_completed} solved
                </div>
              </div>
              <Link
                to={`/problems/${daily.question.slug}`}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                  daily.is_completed
                    ? 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                    : 'bg-blue-600 hover:bg-blue-500 text-white'
                }`}
              >
                {daily.is_completed ? 'Review Daily Challenge' : 'Solve Daily Challenge'}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        )}

        {/* Top KPI Row */}
        {overviewQuery.isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg border border-zinc-800 bg-[#11141B] animate-pulse" />
            ))}
          </div>
        ) : overviewQuery.isError ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            Failed to load mastery overview. Please refresh.
          </div>
        ) : overview ? (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <KpiMetric
              label="Solved"
              value={`${overview.solved_questions}`}
              sub={`of ${overview.total_questions} questions`}
              icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            />
            <KpiMetric
              label="Mastery"
              value={`${overview.mastery_percentage}%`}
              sub={`${overview.pending_questions} remaining`}
              icon={<Code2 className="h-4 w-4 text-blue-400" />}
            />
            <KpiMetric
              label="Attempted"
              value={`${overview.attempted_questions}`}
              sub="In progress"
              icon={<Clock className="h-4 w-4 text-amber-400" />}
            />
            <KpiMetric
              label="Active Streak"
              value={`${overview.current_streak}d`}
              sub="Consecutive coding days"
              icon={<Flame className="h-4 w-4 text-orange-400" />}
            />
            <KpiMetric
              label="Revision & Saved"
              value={`${overview.revision_questions} · ${overview.bookmarked_questions}`}
              sub="Revision · Bookmarks"
              icon={<RotateCcw className="h-4 w-4 text-zinc-400" />}
            />
          </div>
        ) : null}

        {/* Middle Grid: Difficulty Mastery + 14-Day Activity Chart */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Difficulty Breakdown */}
          <div className="lg:col-span-5 rounded-lg border border-zinc-800/80 bg-[#11141B] p-5 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-white">Difficulty Breakdown</h2>
                <Link to="/analytics" className="text-xs text-blue-400 hover:text-blue-300">
                  Full analytics →
                </Link>
              </div>
              <div className="space-y-4">
                {(['Easy', 'Medium', 'Hard'] as const).map((level) => {
                  const bucket = overview?.difficulty[level] ?? { solved: 0, total: 0 };
                  const pct = bucket.total > 0 ? Math.round((bucket.solved / bucket.total) * 100) : 0;
                  const barColor =
                    level === 'Easy' ? 'bg-emerald-500' : level === 'Medium' ? 'bg-amber-500' : 'bg-rose-500';
                  return (
                    <div key={level}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <DifficultyText difficulty={level} />
                        <span className="font-mono text-zinc-300 tabular-nums">
                          {bucket.solved} / {bucket.total} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-zinc-800/90 overflow-hidden">
                        <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 mt-5 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Bookmark className="h-3.5 w-3.5 text-zinc-500" />
                {overview?.bookmarked_questions ?? 0} bookmarked
              </span>
              <Link to="/revisions" className="text-zinc-300 hover:text-white">
                Open revision tracker ({overview?.revision_questions ?? 0}) →
              </Link>
            </div>
          </div>

          {/* 14-Day Coding Activity */}
          <div className="lg:col-span-7 rounded-lg border border-zinc-800/80 bg-[#11141B] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-white">14-Day Submission Velocity</h2>
                <p className="text-xs text-zinc-500 mt-0.5">Daily submissions and newly solved Python problems</p>
              </div>
            </div>
            <div className="h-52 w-full">
              {activityQuery.isLoading ? (
                <div className="h-full w-full rounded bg-zinc-900 animate-pulse" />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activity} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid stroke="#1e2430" strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
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
              )}
            </div>
          </div>
        </div>

        {/* Continue Practising & Recent Submissions */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Continue Practising */}
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Continue Practising</h2>
              <Link to="/practice" className="text-xs text-blue-400 hover:text-blue-300">
                Practice Arena →
              </Link>
            </div>
            <div className="divide-y divide-zinc-800/60">
              {(overview?.continue_practising ?? []).length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400">
                  All queued exercises solved. Launch a custom drill in Practice Arena!
                </div>
              ) : (
                overview?.continue_practising.map((q) => (
                  <Link
                    key={q.id}
                    to={`/problems/${q.slug}`}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-800/35 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-100 truncate">
                        <span className="font-mono text-zinc-500 mr-2 tabular-nums">#{q.question_number}</span>
                        {q.title}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 truncate">
                        {q.category_name} · <DifficultyText difficulty={q.difficulty} />
                      </div>
                    </div>
                    <ProgressStatusText status={q.status} />
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Recent Submissions */}
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Recent Submissions</h2>
              <Link to="/submissions" className="text-xs text-blue-400 hover:text-blue-300">
                All submissions →
              </Link>
            </div>
            <div className="divide-y divide-zinc-800/60">
              {(overview?.recent_submissions ?? []).length === 0 ? (
                <div className="p-6 text-center text-xs text-zinc-400">
                  {user
                    ? 'No submissions yet. Solve your first Python problem to see live verdicts here.'
                    : 'Sign in to record and inspect your Python submission history.'}
                </div>
              ) : (
                overview?.recent_submissions.map((sub) => (
                  <Link
                    key={sub.id}
                    to={`/problems/${sub.question_slug}`}
                    className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-zinc-800/35 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-zinc-100 truncate">
                        <span className="font-mono text-zinc-500 mr-2 tabular-nums">#{sub.question_number}</span>
                        {sub.question_title}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5 tabular-nums">
                        {sub.passed_count}/{sub.total_count} tests · {sub.execution_time_ms}ms
                      </div>
                    </div>
                    <SubmissionVerdictText status={sub.status} />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>

        {/* 21-Category Progress Matrix */}
        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">21 Python Mastery Categories</h2>
              <p className="text-xs text-zinc-500 mt-0.5">Select any category to inspect its Easy, Medium, and Hard exercises</p>
            </div>
            <Link to="/problems" className="text-xs text-blue-400 hover:text-blue-300 whitespace-nowrap">
              Full tracker →
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 divide-y sm:divide-y-0 sm:gap-px bg-zinc-800/50">
            {categories.map((cat) => {
              const solved = Number(cat.solved_count) || 0;
              const total = Number(cat.total_count) || 0;
              const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
              return (
                <Link
                  key={cat.id}
                  to={`/problems/category/${cat.slug}`}
                  className="bg-[#11141B] hover:bg-[#151923] p-4 transition-colors flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono text-zinc-500">
                      <span>{String(cat.order_index).padStart(2, '0')}</span>
                      <span className="tabular-nums text-zinc-400">
                        {solved}/{total}
                      </span>
                    </div>
                    <div className="text-xs font-semibold text-zinc-100 mt-1 line-clamp-1">{cat.name}</div>
                  </div>
                  <div>
                    <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </Layout>
  );
}

function KpiMetric({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4 flex flex-col justify-between">
      <div className="flex items-center justify-between text-xs text-zinc-400">
        <span>{label}</span>
        {icon}
      </div>
      <div className="mt-2">
        <div className="text-xl font-semibold text-white font-mono tabular-nums tracking-tight">{value}</div>
        <div className="text-[11px] text-zinc-500 mt-0.5 truncate">{sub}</div>
      </div>
    </div>
  );
}
