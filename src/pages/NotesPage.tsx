import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StickyNote, Plus, Trash2, Edit3, Search, X } from 'lucide-react';
import { Layout } from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { apiFetch, type NoteTargetType, type UserNote } from '../lib/api';

const TYPE_LABELS: Record<NoteTargetType, string> = {
  concept: 'Concept',
  question: 'Question',
  interview: 'Interview',
  pattern: 'Pattern',
};

export function NotesPage() {
  const { user, openAuthModal } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [editingNote, setEditingNote] = useState<Partial<UserNote> | null>(null);

  const query = useQuery({
    queryKey: ['notes', user?.id, search, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (typeFilter) params.set('type', typeFilter);
      return apiFetch<{ notes: UserNote[] }>(`/api/notes?${params.toString()}`);
    },
    enabled: Boolean(user),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      id?: number;
      target_type: NoteTargetType;
      target_ref: string;
      title: string;
      content: string;
      tags: string;
    }) => {
      if (payload.id) {
        return apiFetch(`/api/notes/${payload.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }
      return apiFetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
    },
    onSuccess: () => {
      setEditingNote(null);
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/notes/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
    },
  });

  if (!user) {
    return (
      <Layout>
        <div className="rounded-lg border border-zinc-800 bg-[#11141B] p-8 text-center space-y-3 max-w-lg mx-auto mt-10">
          <h1 className="text-lg font-semibold text-white">Personal Python Notes</h1>
          <p className="text-xs text-zinc-400">
            Sign in to build a searchable SQLite notebook of Python concepts, interview takeaways, patterns, and problem notes.
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

  const notes = query.data?.notes ?? [];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingNote?.title?.trim() || !editingNote?.content?.trim()) return;
    saveMutation.mutate({
      id: editingNote.id,
      target_type: (editingNote.target_type as NoteTargetType) || 'pattern',
      target_ref: editingNote.target_ref || '',
      title: editingNote.title,
      content: editingNote.content,
      tags: editingNote.tags || '',
    });
  };

  return (
    <Layout>
      <div className="space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white flex items-center gap-2">
              <StickyNote className="h-5 w-5 text-blue-400" />
              Personal Python Notes
            </h1>
            <p className="text-sm text-zinc-400 mt-0.5">
              Save insights on concepts, problem solutions, interview questions, and reusable Python patterns.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              setEditingNote({
                target_type: 'pattern',
                target_ref: '',
                title: '',
                content: '',
                tags: '',
              })
            }
            className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 hover:bg-blue-500 px-3.5 py-2 text-xs font-medium text-white whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            New Note
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="h-3.5 w-3.5 text-zinc-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search note titles, content, tags, or references..."
              className="w-full rounded-md border border-zinc-800 bg-[#11141B] pl-9 pr-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:border-blue-500 focus:outline-none"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-zinc-800 bg-[#11141B] px-3 py-2 text-xs text-zinc-200 focus:border-blue-500 focus:outline-none"
          >
            <option value="">All Note Types</option>
            <option value="concept">Concept Notes</option>
            <option value="question">Question Notes</option>
            <option value="interview">Interview Notes</option>
            <option value="pattern">Coding Patterns</option>
          </select>
        </div>

        {/* Notes Grid */}
        {query.isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-36 rounded-lg border border-zinc-800 bg-[#11141B] animate-pulse" />
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-10 text-center space-y-2">
            <StickyNote className="h-6 w-6 text-zinc-600 mx-auto" />
            <p className="text-sm text-zinc-300">No personal notes found.</p>
            <p className="text-xs text-zinc-500">
              Create a note here or click the Note button inside any problem or interview question.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notes.map((n) => (
              <div key={n.id} className="rounded-lg border border-zinc-800/80 bg-[#11141B] p-4 flex flex-col justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-mono text-blue-400">
                        {TYPE_LABELS[n.target_type]}
                        {n.target_ref ? ` · ${n.target_ref}` : ''}
                      </div>
                      <h3 className="text-sm font-semibold text-white mt-0.5">{n.title}</h3>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditingNote(n)}
                        title="Edit note"
                        className="p-1.5 rounded text-zinc-400 hover:text-white hover:bg-zinc-800"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteMutation.mutate(n.id)}
                        title="Delete note"
                        className="p-1.5 rounded text-zinc-500 hover:text-rose-400 hover:bg-zinc-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-zinc-300 whitespace-pre-wrap leading-relaxed">
                    {n.content}
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-800/70 flex items-center justify-between text-[11px] text-zinc-500">
                  <span className="truncate">{n.tags ? `Tags: ${n.tags}` : 'Untagged'}</span>
                  <span className="font-mono shrink-0">
                    {new Date(n.updated_at + 'Z').toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Create / Edit Modal */}
        {editingNote && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
            <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-[#14171D] overflow-hidden shadow-2xl">
              <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
                <span className="text-sm font-semibold text-white">
                  {editingNote.id ? 'Edit Note' : 'Create Note'}
                </span>
                <button type="button" onClick={() => setEditingNote(null)} className="p-1 text-zinc-400 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <form onSubmit={handleSave} className="p-5 space-y-3.5 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-zinc-400 mb-1">Type</label>
                    <select
                      value={editingNote.target_type || 'pattern'}
                      onChange={(e) =>
                        setEditingNote((prev) => ({ ...prev, target_type: e.target.value as NoteTargetType }))
                      }
                      className="w-full rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1.5 text-zinc-200 focus:border-blue-500 focus:outline-none"
                    >
                      <option value="pattern">Coding Pattern</option>
                      <option value="concept">Concept Note</option>
                      <option value="question">Question Note</option>
                      <option value="interview">Interview Note</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-zinc-400 mb-1">Reference</label>
                    <input
                      type="text"
                      value={editingNote.target_ref || ''}
                      onChange={(e) => setEditingNote((prev) => ({ ...prev, target_ref: e.target.value }))}
                      placeholder="slug or topic"
                      className="w-full rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1.5 text-zinc-200 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Title</label>
                  <input
                    type="text"
                    required
                    value={editingNote.title || ''}
                    onChange={(e) => setEditingNote((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full rounded border border-zinc-800 bg-[#0B0D11] px-3 py-1.5 text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Content</label>
                  <textarea
                    required
                    rows={6}
                    value={editingNote.content || ''}
                    onChange={(e) => setEditingNote((prev) => ({ ...prev, content: e.target.value }))}
                    className="w-full rounded border border-zinc-800 bg-[#0B0D11] p-3 text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-zinc-400 mb-1">Tags</label>
                  <input
                    type="text"
                    value={editingNote.tags || ''}
                    onChange={(e) => setEditingNote((prev) => ({ ...prev, tags: e.target.value }))}
                    placeholder="generators, asyncio, decorators"
                    className="w-full rounded border border-zinc-800 bg-[#0B0D11] px-3 py-1.5 text-zinc-200 focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingNote(null)}
                    className="rounded border border-zinc-800 bg-[#0B0D11] px-3.5 py-1.5 text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    className="rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-1.5 font-medium text-white"
                  >
                    {saveMutation.isPending ? 'Saving...' : 'Save Note'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
