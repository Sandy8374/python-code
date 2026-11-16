import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ArrowRight, Search } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { apiFetch, type CategorySummary, type ConceptSummary } from '../lib/api';

export function ConceptsPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [openCategories, setOpenCategories] = useState<Record<number, boolean>>({ 1: true, 2: true, 3: true });

  const categoriesQuery = useQuery({
    queryKey: ['categories', user?.id ?? 'anon'],
    queryFn: () => apiFetch<{ categories: CategorySummary[] }>('/api/categories'),
  });

  const conceptsQuery = useQuery({
    queryKey: ['concepts', 'all', user?.id ?? 'anon'],
    queryFn: () => apiFetch<{ concepts: ConceptSummary[] }>('/api/concepts'),
  });

  const categories = categoriesQuery.data?.categories ?? [];
  const concepts = conceptsQuery.data?.concepts ?? [];
  const needle = search.trim().toLowerCase();

  const toggleCat = (id: number) => {
    setOpenCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Python Concepts Curriculum</h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              {concepts.length} structured Python concepts grouped across all {categories.length} mastery tracks.
            </p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search Python concept..."
              className="w-full rounded-md border border-zinc-800 bg-[#11141B] pl-9 pr-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
        </div>

        {categoriesQuery.isLoading || conceptsQuery.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-20 rounded-lg border border-zinc-800 bg-[#11141B] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {categories.map((cat) => {
              const catConcepts = concepts.filter(
                (con) =>
                  con.category_id === cat.id &&
                  (!needle ||
                    con.name.toLowerCase().includes(needle) ||
                    con.summary.toLowerCase().includes(needle) ||
                    cat.name.toLowerCase().includes(needle))
              );
              if (needle && catConcepts.length === 0) return null;

              const isOpen = Boolean(needle || openCategories[cat.id]);
              const totalQ = Number(cat.total_count) || 0;
              const solvedQ = Number(cat.solved_count) || 0;

              return (
                <div key={cat.id} className="rounded-lg border border-zinc-800/80 bg-[#11141B] overflow-hidden">
                  <button
                    type="button"
                    onClick={() => toggleCat(cat.id)}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-zinc-800/30 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isOpen ? (
                        <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />
                      )}
                      <span className="font-mono text-xs text-zinc-500 tabular-nums shrink-0">
                        {String(cat.order_index).padStart(2, '0')}
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">{cat.name}</div>
                        <div className="text-xs text-zinc-500 truncate">{cat.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-xs">
                      <span className="font-mono tabular-nums text-zinc-400">
                        {catConcepts.length} concepts · {solvedQ}/{totalQ} solved
                      </span>
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-zinc-800/80 divide-y divide-zinc-800/60 bg-[#0C0E12]">
                      {catConcepts.map((con) => (
                        <div
                          key={con.id}
                          className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-zinc-800/20"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-zinc-100">{con.name}</div>
                            <div className="text-[11px] text-zinc-500 mt-0.5">{con.summary}</div>
                          </div>
                          <div className="flex items-center gap-4 shrink-0">
                            <span className="text-xs font-mono tabular-nums text-zinc-400">
                              {Number(con.solved_count) || 0}/{con.question_count} solved
                            </span>
                            <Link
                              to={`/problems?concept=${encodeURIComponent(con.slug)}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
                            >
                              Practice
                              <ArrowRight className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
