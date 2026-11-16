import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ArrowLeft,
} from 'lucide-react';
import { Layout } from '../components/Layout';
import { DifficultyText, ProgressStatusText } from '../components/StatusText';
import { useAuth } from '../context/AuthContext';
import {
  apiFetch,
  QUESTION_TYPE_LABELS,
  type CategorySummary,
  type ConceptSummary,
  type QuestionListItem,
} from '../lib/api';

export function ProblemsPage() {
  const { slug: categoryParam } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, openAuthModal } = useAuth();
  const queryClient = useQueryClient();

  const [viewMode, setViewMode] = useState<'categories' | 'all'>(
    categoryParam || searchParams.toString() ? 'all' : 'categories'
  );
  const [expandedCatId, setExpandedCatId] = useState<number | null>(null);

  const qSearch = searchParams.get('q') || '';
  const fCategory = categoryParam || searchParams.get('category') || '';
  const fConcept = searchParams.get('concept') || '';
  const fDifficulty = searchParams.get('difficulty') || '';
  const fStatus = searchParams.get('status') || '';
  const fType = searchParams.get('type') || '';
  const fBookmarked = searchParams.get('bookmarked') === 'true';
  const fRevision = searchParams.get('revision') === 'true';
  const fSort = searchParams.get('sort') || 'number';
  const page = Number(searchParams.get('page') || '1');

  useEffect(() => {
    if (categoryParam || searchParams.get('q') || searchParams.get('concept') || searchParams.get('difficulty') || searchParams.get('status')) {
      setViewMode('all');
    }
  }, [categoryParam, searchParams]);

  const categoriesQuery = useQuery({
    queryKey: ['categories', user?.id ?? 'anon'],
    queryFn: () => apiFetch<{ categories: CategorySummary[] }>('/api/categories'),
  });

  const conceptsQuery = useQuery({
    queryKey: ['concepts', fCategory, user?.id ?? 'anon'],
    queryFn: () =>
      apiFetch<{ concepts: ConceptSummary[] }>(
        `/api/concepts${fCategory ? `?category=${encodeURIComponent(fCategory)}` : ''}`
      ),
  });

  const questionsQuery = useQuery({
    queryKey: [
      'questions',
      user?.id ?? 'anon',
      qSearch,
      fCategory,
      fConcept,
      fDifficulty,
      fStatus,
      fType,
      fBookmarked,
      fRevision,
      fSort,
      page,
    ],
    queryFn: () => {
      const p = new URLSearchParams();
      if (qSearch) p.set('q', qSearch);
      if (fCategory) p.set('category', fCategory);
      if (fConcept) p.set('concept', fConcept);
      if (fDifficulty) p.set('difficulty', fDifficulty);
      if (fStatus) p.set('status', fStatus);
      if (fType) p.set('type', fType);
      if (fBookmarked) p.set('bookmarked', 'true');
      if (fRevision) p.set('revision', 'true');
      p.set('sort', fSort);
      p.set('page', String(page));
      p.set('limit', '50');
      return apiFetch<{
        items: QuestionListItem[];
        total: number;
        page: number;
        total_pages: number;
      }>(`/api/questions?${p.toString()}`);
    },
  });

  const toggleBookmark = useMutation({
    mutationFn: async ({ slug, active }: { slug: string; active: boolean }) => {
      if (!user) {
        openAuthModal('login');
        throw new Error('Auth required');
      }
      return apiFetch(`/api/bookmarks/${slug}`, { method: active ? 'DELETE' : 'POST' });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
    },
  });

  const toggleRevision = useMutation({
    mutationFn: async ({ slug, active }: { slug: string; active: boolean }) => {
      if (!user) {
        openAuthModal('login');
        throw new Error('Auth required');
      }
      return apiFetch(`/api/revisions/${slug}`, {
        method: active ? 'DELETE' : 'POST',
        body: active ? undefined : JSON.stringify({ priority: 'Medium', notes: '' }),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['questions'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics-overview'] });
    },
  });

  const updateFilter = (key: string, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
    next.set('page', '1');
    if (categoryParam && key === 'category') {
      navigate(value ? `/problems/category/${value}` : '/problems');
      return;
    }
    setSearchParams(next);
  };

  const clearAllFilters = () => {
    if (categoryParam) {
      navigate('/problems');
    } else {
      setSearchParams(new URLSearchParams());
    }
  };

  const categories = categoriesQuery.data?.categories ?? [];
  const activeCategoryObj = fCategory ? categories.find((c) => c.slug === fCategory) : null;
  const concepts = conceptsQuery.data?.concepts ?? [];
  const questions = questionsQuery.data?.items ?? [];

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            {activeCategoryObj ? (
              <div className="flex items-center gap-2 mb-1">
                <Link
                  to="/problems"
                  className="inline-flex items-center gap-1 text-xs text-zinc-400 hover:text-white"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  All 20 Categories
                </Link>
              </div>
            ) : null}
            <h1 className="text-xl font-semibold tracking-tight text-white">
              {activeCategoryObj
                ? `${String(activeCategoryObj.order_index).padStart(2, '0')}. ${activeCategoryObj.name}`
                : 'Python Problems Tracker'}
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {activeCategoryObj
                ? activeCategoryObj.description
                : 'Structured Striver-style tracker across 20 Python language & engineering categories.'}
            </p>
          </div>

          {!categoryParam && (
            <div className="inline-flex rounded-md border border-zinc-800 bg-[#11141B] p-1 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('categories')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  viewMode === 'categories' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                20-Category Matrix
              </button>
              <button
                type="button"
                onClick={() => setViewMode('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                  viewMode === 'all' ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Problem Explorer
              </button>
            </div>
          )}
        </div>

        {/* Category Summary Table + Expandable View */}
        {viewMode === 'categories' && !categoryParam ? (
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500 bg-[#0F1218]">
                    <th className="py-3 px-4 font-medium w-14">#</th>
                    <th className="py-3 px-4 font-medium">Category</th>
                    <th className="py-3 px-4 font-medium text-right">Easy</th>
                    <th className="py-3 px-4 font-medium text-right">Medium</th>
                    <th className="py-3 px-4 font-medium text-right">Hard</th>
                    <th className="py-3 px-4 font-medium text-right">Total</th>
                    <th className="py-3 px-4 font-medium w-48">Completion</th>
                    <th className="py-3 px-4 font-medium text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/60 text-xs">
                  {categories.map((cat) => {
                    const total = Number(cat.total_count) || 0;
                    const solved = Number(cat.solved_count) || 0;
                    const pct = total > 0 ? Math.round((solved / total) * 100) : 0;
                    const isExpanded = expandedCatId === cat.id;

                    return (
                      <CategoryTableRow
                        key={cat.id}
                        cat={cat}
                        pct={pct}
                        solved={solved}
                        total={total}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedCatId(isExpanded ? null : cat.id)}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Problem Explorer with Multi-Filter Toolbar */
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-6 gap-2.5">
                <div className="relative xl:col-span-2">
                  <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={qSearch}
                    onChange={(e) => updateFilter('q', e.target.value)}
                    placeholder="Filter by title, concept, or #number..."
                    className="w-full rounded-md border border-zinc-800 bg-[#0B0D11] pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                {!categoryParam && (
                  <select
                    value={fCategory}
                    onChange={(e) => updateFilter('category', e.target.value)}
                    className="rounded-md border border-zinc-800 bg-[#0B0D11] px-2.5 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">All 20 Categories</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.slug}>
                        {String(c.order_index).padStart(2, '0')}. {c.name}
                      </option>
                    ))}
                  </select>
                )}

                <select
                  value={fConcept}
                  onChange={(e) => updateFilter('concept', e.target.value)}
                  className="rounded-md border border-zinc-800 bg-[#0B0D11] px-2.5 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">All Concepts</option>
                  {concepts.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>

                <select
                  value={fDifficulty}
                  onChange={(e) => updateFilter('difficulty', e.target.value)}
                  className="rounded-md border border-zinc-800 bg-[#0B0D11] px-2.5 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">All Difficulties</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>

                <select
                  value={fStatus}
                  onChange={(e) => updateFilter('status', e.target.value)}
                  className="rounded-md border border-zinc-800 bg-[#0B0D11] px-2.5 py-1.5 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
                >
                  <option value="">All Statuses</option>
                  <option value="Not Started">Not Started</option>
                  <option value="Attempted">Attempted</option>
                  <option value="Solved">Solved</option>
                  <option value="Needs Revision">Needs Revision</option>
                </select>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={fType}
                    onChange={(e) => updateFilter('type', e.target.value)}
                    className="rounded-md border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="">All Question Types</option>
                    {Object.entries(QUESTION_TYPE_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => updateFilter('bookmarked', fBookmarked ? '' : 'true')}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors whitespace-nowrap ${
                      fBookmarked
                        ? 'border-blue-500/40 bg-blue-500/15 text-blue-300'
                        : 'border-zinc-800 bg-[#0B0D11] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Bookmark className="h-3 w-3" />
                    Bookmarked
                  </button>

                  <button
                    type="button"
                    onClick={() => updateFilter('revision', fRevision ? '' : 'true')}
                    className={`inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors whitespace-nowrap ${
                      fRevision
                        ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                        : 'border-zinc-800 bg-[#0B0D11] text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Revision
                  </button>

                  {(qSearch || fCategory || fConcept || fDifficulty || fStatus || fType || fBookmarked || fRevision) && (
                    <button
                      type="button"
                      onClick={clearAllFilters}
                      className="text-xs text-zinc-400 hover:text-white px-2 py-1"
                    >
                      Clear filters
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <select
                    value={fSort}
                    onChange={(e) => updateFilter('sort', e.target.value)}
                    className="rounded-md border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 text-xs text-zinc-300 focus:border-blue-500 focus:outline-none"
                  >
                    <option value="number">Sort: Question #</option>
                    <option value="difficulty">Sort: Difficulty</option>
                    <option value="status">Sort: Mastery Status</option>
                    <option value="recent_attempt">Sort: Recent Attempt</option>
                  </select>
                  <span className="font-mono tabular-nums text-zinc-500">
                    {questionsQuery.data?.total ?? 0} results
                  </span>
                </div>
              </div>
            </div>

            {/* Problems Table */}
            <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
              {questionsQuery.isLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="h-10 rounded bg-zinc-900 animate-pulse" />
                  ))}
                </div>
              ) : questions.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <p className="text-sm font-medium text-zinc-200">No Python exercises match your active filters.</p>
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    Reset all filters
                  </button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-500 bg-[#0F1218]">
                        <th className="py-3 px-4 font-medium w-16">#</th>
                        <th className="py-3 px-4 font-medium">Exercise Title</th>
                        <th className="py-3 px-4 font-medium">Concept</th>
                        <th className="py-3 px-4 font-medium">Type</th>
                        <th className="py-3 px-4 font-medium">Difficulty</th>
                        <th className="py-3 px-4 font-medium">Status</th>
                        <th className="py-3 px-4 font-medium text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60 text-xs">
                      {questions.map((q) => {
                        const bookmarked = Boolean(q.is_bookmarked);
                        const revision = Boolean(q.is_revision);
                        return (
                          <tr key={q.id} className="hover:bg-zinc-800/30 transition-colors">
                            <td className="py-3 px-4 font-mono text-zinc-500 tabular-nums">{q.question_number}</td>
                            <td className="py-3 px-4">
                              <Link
                                to={`/problems/${q.slug}`}
                                className="font-medium text-zinc-100 hover:text-blue-400 transition-colors"
                              >
                                {q.title}
                              </Link>
                              <div className="text-[11px] text-zinc-500 mt-0.5">{q.category_name}</div>
                            </td>
                            <td className="py-3 px-4 text-zinc-300">{q.concept_name}</td>
                            <td className="py-3 px-4 text-zinc-400">{QUESTION_TYPE_LABELS[q.question_type]}</td>
                            <td className="py-3 px-4">
                              <DifficultyText difficulty={q.difficulty} />
                            </td>
                            <td className="py-3 px-4">
                              <ProgressStatusText status={q.status} />
                            </td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => toggleBookmark.mutate({ slug: q.slug, active: bookmarked })}
                                  title={bookmarked ? 'Remove bookmark' : 'Bookmark problem'}
                                  className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${
                                    bookmarked ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-300'
                                  }`}
                                >
                                  <Bookmark className="h-3.5 w-3.5" fill={bookmarked ? 'currentColor' : 'none'} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => toggleRevision.mutate({ slug: q.slug, active: revision })}
                                  title={revision ? 'Remove from revision' : 'Mark for revision'}
                                  className={`p-1.5 rounded hover:bg-zinc-800 transition-colors ${
                                    revision ? 'text-amber-400' : 'text-zinc-500 hover:text-zinc-300'
                                  }`}
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {questionsQuery.data && questionsQuery.data.total_pages > 1 && (
                <div className="px-4 py-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
                  <span className="font-mono tabular-nums">
                    Page {questionsQuery.data.page} of {questionsQuery.data.total_pages}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={page <= 1}
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        next.set('page', String(page - 1));
                        setSearchParams(next);
                      }}
                      className="rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 disabled:opacity-40 hover:text-white"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= questionsQuery.data.total_pages}
                      onClick={() => {
                        const next = new URLSearchParams(searchParams);
                        next.set('page', String(page + 1));
                        setSearchParams(next);
                      }}
                      className="rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1 disabled:opacity-40 hover:text-white"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function CategoryTableRow({
  cat,
  pct,
  solved,
  total,
  isExpanded,
  onToggle,
}: {
  cat: CategorySummary;
  pct: number;
  solved: number;
  total: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { user } = useAuth();
  const detailQuery = useQuery({
    queryKey: ['category-detail', cat.slug, user?.id ?? 'anon'],
    queryFn: () =>
      apiFetch<{
        questions: {
          id: number;
          question_number: number;
          slug: string;
          title: string;
          difficulty: string;
          concept_name: string;
          status: string;
        }[];
      }>(`/api/categories/${cat.slug}`),
    enabled: isExpanded,
  });

  const grouped = {
    Easy: (detailQuery.data?.questions ?? []).filter((q) => q.difficulty === 'Easy'),
    Medium: (detailQuery.data?.questions ?? []).filter((q) => q.difficulty === 'Medium'),
    Hard: (detailQuery.data?.questions ?? []).filter((q) => q.difficulty === 'Hard'),
  };

  return (
    <>
      <tr className="hover:bg-zinc-800/30 transition-colors">
        <td className="py-3.5 px-4 font-mono text-zinc-500 tabular-nums">
          {String(cat.order_index).padStart(2, '0')}
        </td>
        <td className="py-3.5 px-4">
          <button
            type="button"
            onClick={onToggle}
            className="flex items-center gap-2 text-left font-medium text-zinc-100 hover:text-blue-400 transition-colors"
          >
            {isExpanded ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />}
            <div>
              <div>{cat.name}</div>
              <div className="text-[11px] font-normal text-zinc-500 line-clamp-1">{cat.description}</div>
            </div>
          </button>
        </td>
        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-emerald-400">{cat.easy_count}</td>
        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-amber-400">{cat.medium_count}</td>
        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-rose-400">{cat.hard_count}</td>
        <td className="py-3.5 px-4 text-right font-mono tabular-nums text-zinc-200">{total}</td>
        <td className="py-3.5 px-4">
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-zinc-800 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono tabular-nums text-[11px] text-zinc-300 w-14 text-right">
              {solved}/{total}
            </span>
          </div>
        </td>
        <td className="py-3.5 px-4 text-right">
          <Link
            to={`/problems/category/${cat.slug}`}
            className="text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
          >
            Open Track →
          </Link>
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={8} className="bg-[#0C0E12] px-6 py-4 border-t border-zinc-800/60">
            {detailQuery.isLoading ? (
              <div className="h-24 rounded bg-zinc-900 animate-pulse" />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {(['Easy', 'Medium', 'Hard'] as const).map((tier) => (
                  <div key={tier} className="space-y-2">
                    <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800">
                      <DifficultyText difficulty={tier} />
                      <span className="font-mono text-[11px] text-zinc-500 tabular-nums">
                        {grouped[tier].length} exercises
                      </span>
                    </div>
                    <div className="space-y-1">
                      {grouped[tier].map((q) => (
                        <Link
                          key={q.id}
                          to={`/problems/${q.slug}`}
                          className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-zinc-800/50 transition-colors"
                        >
                          <div className="min-w-0 truncate">
                            <span className="font-mono text-[11px] text-zinc-500 mr-1.5 tabular-nums">
                              #{q.question_number}
                            </span>
                            <span className="text-xs text-zinc-200">{q.title}</span>
                          </div>
                          <ProgressStatusText status={q.status} />
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
