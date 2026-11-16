import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, Trash2, ArrowRight } from 'lucide-react';
import { Layout } from '../components/Layout';
import { DifficultyText, ProgressStatusText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import { apiFetch, QUESTION_TYPE_LABELS, type BookmarkItem } from '../lib/api';

export function BookmarksPage() {
  const { user, openAuthModal } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['bookmarks', user?.id],
    queryFn: () => apiFetch<{ bookmarks: BookmarkItem[] }>('/api/bookmarks'),
    enabled: Boolean(user),
  });

  const removeMutation = useMutation({
    mutationFn: (slug: string) => apiFetch(`/api/bookmarks/${slug}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bookmarks'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
    },
  });

  if (!user) {
    return (
      <Layout>
        <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-8 text-center space-y-3 max-w-lg mx-auto mt-10">
          <h1 className="text-lg font-semibold text-white">Saved Bookmarks</h1>
          <p className="text-xs text-zinc-400">Sign in to organize and revisit your bookmarked Python challenges.</p>
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

  const bookmarks = query.data?.bookmarks ?? [];

  return (
    <Layout>
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Bookmarks</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            Curated Python problems saved for focused review ({bookmarks.length}).
          </p>
        </div>

        <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
          {query.isLoading ? (
            <div className="p-6 space-y-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-12 rounded bg-zinc-900 animate-pulse" />
              ))}
            </div>
          ) : bookmarks.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Bookmark className="h-6 w-6 text-zinc-600 mx-auto" />
              <p className="text-sm text-zinc-300">No bookmarked exercises yet.</p>
              <Link to="/problems" className="text-xs text-blue-400 hover:text-blue-300">
                Browse Python Problems →
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-zinc-800/60">
              {bookmarks.map((b) => (
                <div
                  key={b.id}
                  className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/25"
                >
                  <div className="min-w-0">
                    <Link to={`/problems/${b.slug}`} className="text-xs font-medium text-white hover:text-blue-400">
                      <span className="font-mono text-zinc-500 mr-1.5 tabular-nums">#{b.question_number}</span>
                      {b.title}
                    </Link>
                    <div className="text-[11px] text-zinc-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span>{b.category_name}</span>
                      <span>·</span>
                      <span>{b.concept_name}</span>
                      <span>·</span>
                      <span>{QUESTION_TYPE_LABELS[b.question_type]}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <DifficultyText difficulty={b.difficulty} />
                    <ProgressStatusText status={b.status} />
                    <Link
                      to={`/problems/${b.slug}`}
                      className="inline-flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                    >
                      Open
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                    <button
                      type="button"
                      onClick={() => removeMutation.mutate(b.slug)}
                      title="Remove bookmark"
                      className="p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
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
