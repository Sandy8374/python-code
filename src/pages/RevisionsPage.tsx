import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw,
  Trash2,
  Check,
  ArrowRight,
  SlidersHorizontal,
  CheckCircle2,
  AlertCircle,
  Plus,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { DifficultyText, PriorityText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  type RevisionDashboardResponse,
  type RevisionItem,
  type RevisionPriority,
  type RevisionSettings,
} from '../lib/api';

type RevisionTab = 'queued' | 'due_now' | 'incorrect' | 'hinted' | 'independent' | 'forgotten';

export function RevisionsPage() {
  const { user, openAuthModal } = useAuth();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<RevisionTab>('queued');
  const [showConfig, setShowConfig] = useState(false);
  const [settingsForm, setSettingsForm] = useState<RevisionSettings>({
    incorrect_interval_days: 1,
    hinted_interval_days: 2,
    independent_interval_days: 7,
    forgotten_interval_days: 1,
  });
  const [configSaved, setConfigSaved] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: ['revisions-dashboard', user?.id],
    queryFn: () => apiFetch<RevisionDashboardResponse>('/api/revisions/dashboard'),
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (dashboardQuery.data?.settings) {
      setSettingsForm(dashboardQuery.data.settings);
    }
  }, [dashboardQuery.data]);

  const saveSettingsMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/revisions/settings', {
        method: 'PUT',
        body: JSON.stringify(settingsForm),
      }),
    onSuccess: () => {
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 1800);
      void queryClient.invalidateQueries({ queryKey: ['revisions-dashboard'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ slug, notes, priority }: { slug: string; notes: string; priority: RevisionPriority }) =>
      apiFetch(`/api/revisions/${slug}`, {
        method: 'POST',
        body: JSON.stringify({ notes, priority }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['revisions-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['revisions'] });
    },
  });

  const reviewMutation = useMutation({
    mutationFn: ({ slug, outcome }: { slug: string; outcome: 'good' | 'forgot' }) =>
      apiFetch(`/api/revisions/${slug}/review`, {
        method: 'POST',
        body: JSON.stringify({ outcome }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['revisions-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['revisions'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (slug: string) => apiFetch(`/api/revisions/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['revisions-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['revisions'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
    },
  });

  if (!user) {
    return (
      <Layout>
        <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-8 text-center space-y-3 max-w-lg mx-auto mt-10">
          <h1 className="text-lg font-semibold text-white">Spaced Revision Dashboard</h1>
          <p className="text-xs text-zinc-400">
            Sign in to configure spaced revision intervals and review incorrect, hinted, and forgotten Python problems.
          </p>
          <button
            type="button"
            onClick={() => openAuthModal('login')}
            className="rounded-md bg-blue-600 hover:bg-blue-500 px-4 py-2 text-xs font-medium text-white"
          >
            Sign In
          </button>
        </div>
      </Layout>
    );
  }

  const data = dashboardQuery.data;
  const summary = data?.summary;

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Spaced Revision Dashboard</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Smart Python review schedule driven by wrong answers, hint usage, independent solves, and forgotten concepts.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowConfig((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-blue-400" />
            {showConfig ? 'Hide Interval Settings' : 'Configure Intervals'}
          </button>
        </div>

        {/* Interval Configurator */}
        {showConfig && (
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xs font-semibold text-white">Configurable Revision Intervals (Days)</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Automatically applied when submitting exercises or marking reviews below.
                </p>
              </div>
              <button
                type="button"
                disabled={saveSettingsMutation.isPending}
                onClick={() => saveSettingsMutation.mutate()}
                className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white whitespace-nowrap"
              >
                {configSaved ? <Check className="h-3.5 w-3.5" /> : null}
                {configSaved ? 'Saved' : 'Save Intervals'}
              </button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              {(
                [
                  { key: 'incorrect_interval_days', label: 'Incorrect Attempts (days)', max: 60 },
                  { key: 'hinted_interval_days', label: 'Solved with Hints (days)', max: 60 },
                  { key: 'independent_interval_days', label: 'Solved Independently (days)', max: 90 },
                  { key: 'forgotten_interval_days', label: 'Marked Forgotten (days)', max: 30 },
                ] as const
              ).map((field) => (
                <div key={field.key} className="rounded border border-zinc-800 bg-[#0B0D11] p-3">
                  <label className="block text-[11px] text-zinc-400 mb-1">{field.label}</label>
                  <input
                    type="number"
                    min={1}
                    max={field.max}
                    value={settingsForm[field.key]}
                    onChange={(e) =>
                      setSettingsForm((prev) => ({
                        ...prev,
                        [field.key]: Math.max(1, Math.min(field.max, Number(e.target.value) || 1)),
                      }))
                    }
                    className="w-full rounded border border-zinc-800 bg-[#11141B] px-2.5 py-1 font-mono text-zinc-100 tabular-nums focus:border-blue-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
            <div className="text-xs text-zinc-400">Due Now</div>
            <div className="text-xl font-mono font-semibold text-amber-400 tabular-nums mt-1">
              {summary?.due_now ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{summary?.total_queued ?? 0} total queued</div>
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
            <div className="text-xs text-zinc-400">Incorrect History</div>
            <div className="text-xl font-mono font-semibold text-rose-400 tabular-nums mt-1">
              {summary?.incorrect_count ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Suggested for retry</div>
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
            <div className="text-xs text-zinc-400">Solved With Hints</div>
            <div className="text-xl font-mono font-semibold text-blue-400 tabular-nums mt-1">
              {summary?.hinted_count ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">Re-attempt hint-free</div>
          </div>
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4">
            <div className="text-xs text-zinc-400">Forgotten Concepts</div>
            <div className="text-xl font-mono font-semibold text-zinc-200 tabular-nums mt-1">
              {summary?.forgotten_count ?? 0}
            </div>
            <div className="text-[11px] text-zinc-500 mt-0.5">{summary?.independent_count ?? 0} independent mastered</div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 border-b border-zinc-800 overflow-x-auto pb-2">
          {(
            [
              { id: 'queued', label: `All Queued (${summary?.total_queued ?? 0})` },
              { id: 'due_now', label: `Due Now (${summary?.due_now ?? 0})` },
              { id: 'incorrect', label: `Incorrect (${summary?.incorrect_count ?? 0})` },
              { id: 'hinted', label: `With Hints (${summary?.hinted_count ?? 0})` },
              { id: 'independent', label: `Independent (${summary?.independent_count ?? 0})` },
              { id: 'forgotten', label: `Forgotten (${summary?.forgotten_count ?? 0})` },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 transition-colors ${
                activeTab === t.id ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {dashboardQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg border border-zinc-800 bg-[#11141B] animate-pulse" />
            ))}
          </div>
        ) : activeTab === 'queued' || activeTab === 'due_now' || activeTab === 'forgotten' ? (
          (() => {
            const list =
              activeTab === 'queued'
                ? data?.queued ?? []
                : activeTab === 'due_now'
                ? data?.suggestions.due_now ?? []
                : data?.suggestions.forgotten ?? [];

            if (list.length === 0) {
              return (
                <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-10 text-center space-y-2">
                  <RotateCcw className="h-6 w-6 text-zinc-600 mx-auto" />
                  <p className="text-sm text-zinc-300">No questions in this revision bucket.</p>
                  <Link to="/problems" className="text-xs text-blue-400 hover:text-blue-300">
                    Explore Python Problems →
                  </Link>
                </div>
              );
            }
            return (
              <div className="space-y-3">
                {list.map((item) => (
                  <RevisionCard
                    key={item.id}
                    item={item}
                    onSave={(notes, priority) => updateMutation.mutate({ slug: item.slug, notes, priority })}
                    onReview={(outcome) => reviewMutation.mutate({ slug: item.slug, outcome })}
                    onDelete={() => deleteMutation.mutate(item.slug)}
                  />
                ))}
              </div>
            );
          })()
        ) : (
          (() => {
            const sugList =
              activeTab === 'incorrect'
                ? data?.suggestions.incorrect ?? []
                : activeTab === 'hinted'
                ? data?.suggestions.hinted ?? []
                : data?.suggestions.independent ?? [];

            if (sugList.length === 0) {
              return (
                <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-8 text-center text-xs text-zinc-400">
                  No suggested exercises in this category yet. Keep practicing to populate smart recommendations.
                </div>
              );
            }

            return (
              <div className="divide-y divide-zinc-800/60 rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
                {sugList.map((s) => (
                  <div key={s.id} className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link to={`/problems/${s.slug}`} className="text-xs font-medium text-white hover:text-blue-400">
                        <span className="font-mono text-zinc-500 mr-1.5 tabular-nums">#{s.question_number}</span>
                        {s.title}
                      </Link>
                      <div className="text-[11px] text-zinc-500 mt-0.5 flex flex-wrap items-center gap-2">
                        <span>{s.category_name}</span>
                        <span>·</span>
                        <span>{s.concept_name}</span>
                        <span>·</span>
                        <DifficultyText difficulty={s.difficulty} />
                        {s.fail_count ? (
                          <span className="text-rose-400 font-mono tabular-nums">· {s.fail_count} failed attempts</span>
                        ) : null}
                        {s.hints_count ? (
                          <span className="text-amber-400 font-mono tabular-nums">· {s.hints_count} hints used</span>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() =>
                          updateMutation.mutate({
                            slug: s.slug,
                            notes:
                              activeTab === 'incorrect'
                                ? 'Suggested from failed attempt'
                                : activeTab === 'hinted'
                                ? 'Re-solve without hints'
                                : 'Retention check',
                            priority: activeTab === 'incorrect' ? 'High' : 'Medium',
                          })
                        }
                        className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 whitespace-nowrap"
                      >
                        <Plus className="h-3 w-3 text-blue-400" />
                        Queue Revision
                      </button>
                      <Link
                        to={`/problems/${s.slug}`}
                        className="inline-flex items-center gap-1 rounded bg-blue-600 hover:bg-blue-500 px-3 py-1 text-xs font-medium text-white whitespace-nowrap"
                      >
                        Practice
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()
        )}
      </div>
    </Layout>
  );
}

function RevisionCard({
  item,
  onSave,
  onReview,
  onDelete,
}: {
  item: RevisionItem;
  onSave: (notes: string, priority: RevisionPriority) => void;
  onReview: (outcome: 'good' | 'forgot') => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(item.notes || '');
  const [priority, setPriority] = useState<RevisionPriority>(item.priority || 'Medium');
  const [savedFlash, setSavedFlash] = useState(false);

  const handleSave = () => {
    onSave(notes, priority);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const nextReviewLabel = item.next_review_at
    ? new Date(item.next_review_at + (item.next_review_at.endsWith('Z') ? '' : 'Z')).toLocaleDateString()
    : 'Now';

  return (
    <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4 space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link to={`/problems/${item.slug}`} className="text-sm font-medium text-white hover:text-blue-400">
              <span className="font-mono text-zinc-500 mr-1.5 tabular-nums">#{item.question_number}</span>
              {item.title}
            </Link>
            {Number(item.is_due) === 1 ? (
              <span className="text-[11px] font-mono text-amber-400">· Due Now</span>
            ) : (
              <span className="text-[11px] font-mono text-zinc-500">· Next: {nextReviewLabel}</span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap items-center gap-2">
            <span>{item.category_name}</span>
            <span>·</span>
            <span>{item.concept_name}</span>
            <span>·</span>
            <DifficultyText difficulty={item.difficulty} />
            <span>·</span>
            <span>
              Priority: <PriorityText priority={priority} />
            </span>
            <span className="font-mono tabular-nums">
              · Interval {item.interval_days || 1}d · {item.reason || 'manual'} · {item.review_count || 0} reviews
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onReview('good')}
            className="inline-flex items-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-2.5 py-1 text-xs font-medium text-emerald-300 whitespace-nowrap"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Reviewed (Advance)
          </button>

          <button
            type="button"
            onClick={() => onReview('forgot')}
            className="inline-flex items-center gap-1 rounded border border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/20 px-2.5 py-1 text-xs font-medium text-rose-300 whitespace-nowrap"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Forgot (Reset)
          </button>

          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as RevisionPriority)}
            className="rounded border border-zinc-800 bg-[#0B0D11] px-2 py-1 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <Link
            to={`/problems/${item.slug}`}
            className="inline-flex items-center gap-1 rounded border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-2.5 py-1 text-xs text-zinc-200 whitespace-nowrap"
          >
            Practice
            <ArrowRight className="h-3 w-3" />
          </Link>

          <button
            type="button"
            onClick={onDelete}
            title="Remove from revision"
            className="p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add revision notes (e.g., review functools.wraps signature preservation)..."
          className="flex-1 rounded-md border border-zinc-800 bg-[#0B0D11] px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSave}
          className="inline-flex items-center justify-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 hover:bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-200 whitespace-nowrap"
        >
          {savedFlash ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : null}
          {savedFlash ? 'Saved' : 'Save Note'}
        </button>
      </div>
    </div>
  );
}
