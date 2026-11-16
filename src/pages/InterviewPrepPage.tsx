import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Briefcase, CheckCircle2, ChevronDown, ChevronRight, ArrowRight, StickyNote } from 'lucide-react';
import { Layout } from '../components/Layout';
import { DifficultyText, ProgressStatusText } from '../components/StatusText';
import { QuickNoteModal } from '../components/QuickNoteModal';
import { useAuth } from '../context/AuthContext';
import { apiFetch, type InterviewPrepItem, type InterviewPrepResponse } from '../lib/api';

export function InterviewPrepPage() {
  const { user, openAuthModal } = useAuth();
  const queryClient = useQueryClient();

  const [selectedTopic, setSelectedTopic] = useState<string>('');
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [noteTarget, setNoteTarget] = useState<{ ref: string; title: string } | null>(null);

  const query = useQuery({
    queryKey: ['interview-prep', user?.id ?? 'anon'],
    queryFn: () => apiFetch<InterviewPrepResponse>('/api/interview-prep'),
  });

  const updateProgressMutation = useMutation({
    mutationFn: ({
      id,
      is_reviewed,
      confidence,
    }: {
      id: string;
      is_reviewed: boolean;
      confidence: 'Low' | 'Medium' | 'High';
    }) =>
      apiFetch(`/api/interview-prep/${id}/progress`, {
        method: 'PUT',
        body: JSON.stringify({ is_reviewed, confidence }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['interview-prep'] });
    },
  });

  const topics = query.data?.topics ?? [];
  const items = (query.data?.items ?? []).filter(
    (item) => !selectedTopic || item.topic === selectedTopic
  );

  const totalReviewed = (query.data?.items ?? []).filter((i) => i.is_reviewed).length;
  const totalCount = (query.data?.items ?? []).length;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleProgressChange = (
    item: InterviewPrepItem,
    nextReviewed: boolean,
    nextConfidence: 'Low' | 'Medium' | 'High'
  ) => {
    if (!user) {
      openAuthModal('login');
      return;
    }
    updateProgressMutation.mutate({
      id: item.id,
      is_reviewed: nextReviewed,
      confidence: nextConfidence,
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
              <Briefcase className="h-5 w-5 text-blue-400" />
              Python Interview Preparation
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              12 core backend &amp; Python engineering tracks with structured Q&amp;As, follow-up probes, confidence tracking, and linked coding exercises.
            </p>
          </div>
          <div className="rounded-md border border-zinc-800 bg-[#11141B] px-3.5 py-2 text-xs font-mono tabular-nums text-zinc-200 shrink-0">
            Reviewed: <strong className="text-emerald-400">{totalReviewed}</strong> / {totalCount}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* 12-Track Sidebar */}
          <div className="lg:col-span-4 rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden self-start">
            <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between">
              <span className="text-xs font-semibold text-white">12 Interview Tracks</span>
              {selectedTopic && (
                <button
                  type="button"
                  onClick={() => setSelectedTopic('')}
                  className="text-[11px] text-blue-400 hover:text-blue-300"
                >
                  Show All
                </button>
              )}
            </div>
            <div className="divide-y divide-zinc-800/60">
              {topics.map((t) => (
                <button
                  key={t.topic}
                  type="button"
                  onClick={() => setSelectedTopic(selectedTopic === t.topic ? '' : t.topic)}
                  className={`w-full px-4 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                    selectedTopic === t.topic ? 'bg-blue-600/15 text-white' : 'text-zinc-300 hover:bg-zinc-800/30'
                  }`}
                >
                  <span className="truncate">
                    <span className="font-mono text-zinc-500 mr-1.5 tabular-nums">
                      {String(t.topic_order).padStart(2, '0')}
                    </span>
                    {t.topic}
                  </span>
                  <span className="font-mono text-[11px] text-zinc-400 tabular-nums shrink-0">
                    {t.reviewed}/{t.total}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Q&A List */}
          <div className="lg:col-span-8 space-y-3">
            {query.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg border border-zinc-800 bg-[#11141B] animate-pulse" />
              ))
            ) : (
              items.map((item) => {
                const open = Boolean(expandedIds[item.id]);
                return (
                  <div key={item.id} className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleExpand(item.id)}
                      className="w-full px-4 py-3.5 text-left flex items-start justify-between gap-3 hover:bg-zinc-800/25 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="text-[11px] text-zinc-400 flex flex-wrap items-center gap-2">
                          <span className="font-mono text-blue-400">{item.topic}</span>
                          <span>·</span>
                          <DifficultyText difficulty={item.difficulty} />
                          <span>·</span>
                          <span
                            className={
                              item.confidence === 'High'
                                ? 'text-emerald-400'
                                : item.confidence === 'Low'
                                ? 'text-rose-400'
                                : 'text-amber-400'
                            }
                          >
                            {item.confidence} Confidence
                          </span>
                        </div>
                        <div className="text-sm font-medium text-white">{item.question}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 pt-1">
                        {item.is_reviewed && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                        {open ? (
                          <ChevronDown className="h-4 w-4 text-zinc-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-zinc-400" />
                        )}
                      </div>
                    </button>

                    {open && (
                      <div className="px-4 pb-4 pt-2 border-t border-zinc-800/70 space-y-3.5 text-xs">
                        <div className="rounded border border-zinc-800 bg-[#0B0D11] p-3.5 text-zinc-200 leading-relaxed whitespace-pre-wrap">
                          {item.answer}
                        </div>

                        {item.key_points.length > 0 && (
                          <div className="space-y-1">
                            <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                              Key Takeaways
                            </div>
                            <ul className="list-disc list-inside space-y-1 text-zinc-300">
                              {item.key_points.map((kp, i) => (
                                <li key={i}>{kp}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {item.follow_up && (
                          <div className="rounded border border-zinc-800 bg-[#0B0D11] p-3 text-zinc-300">
                            <span className="font-semibold text-amber-400">Follow-up Probe: </span>
                            {item.follow_up}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/70">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleProgressChange(item, !item.is_reviewed, item.confidence)}
                              className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 text-xs font-medium ${
                                item.is_reviewed
                                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                  : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white'
                              }`}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {item.is_reviewed ? 'Reviewed' : 'Mark Reviewed'}
                            </button>

                            <select
                              value={item.confidence}
                              onChange={(e) =>
                                handleProgressChange(
                                  item,
                                  item.is_reviewed,
                                  e.target.value as 'Low' | 'Medium' | 'High'
                                )
                              }
                              className="rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                            >
                              <option value="Low">Low Confidence</option>
                              <option value="Medium">Medium Confidence</option>
                              <option value="High">High Confidence</option>
                            </select>

                            <button
                              type="button"
                              onClick={() => setNoteTarget({ ref: item.id, title: item.question })}
                              className="inline-flex items-center gap-1 rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 text-xs text-zinc-300 hover:text-white"
                            >
                              <StickyNote className="h-3 w-3 text-blue-400" />
                              Add Note
                            </button>
                          </div>

                          {item.linked_question && (
                            <Link
                              to={`/problems/${item.linked_question.slug}`}
                              className="inline-flex items-center gap-2 rounded border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 px-3 py-1 text-xs text-blue-300"
                            >
                              <span>
                                Practice #{item.linked_question.question_number}: {item.linked_question.title}
                              </span>
                              <ProgressStatusText status={item.linked_question.status} />
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {noteTarget && (
        <QuickNoteModal
          isOpen={Boolean(noteTarget)}
          onClose={() => setNoteTarget(null)}
          defaultType="interview"
          defaultRef={noteTarget.ref}
          defaultTitle={noteTarget.title}
        />
      )}
    </Layout>
  );
}
