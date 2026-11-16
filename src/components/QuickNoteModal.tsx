import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { StickyNote, X } from 'lucide-react';
import { apiFetch, type NoteTargetType } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface QuickNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultType?: NoteTargetType;
  defaultRef?: string;
  defaultTitle?: string;
}

export function QuickNoteModal({
  isOpen,
  onClose,
  defaultType = 'question',
  defaultRef = '',
  defaultTitle = '',
}: QuickNoteModalProps) {
  const { user, openAuthModal } = useAuth();
  const queryClient = useQueryClient();

  const [targetType, setTargetType] = useState<NoteTargetType>(defaultType);
  const [targetRef, setTargetRef] = useState(defaultRef);
  const [title, setTitle] = useState(defaultTitle);
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/notes', {
        method: 'POST',
        body: JSON.stringify({
          target_type: targetType,
          target_ref: targetRef,
          title,
          content,
          tags,
        }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      setContent('');
      setTags('');
      onClose();
    },
  });

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal('login');
      return;
    }
    if (!title.trim() || !content.trim()) return;
    createMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
      <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-[#14171D] overflow-hidden shadow-2xl">
        <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <StickyNote className="h-4 w-4 text-blue-400" />
            Save Personal Note
          </div>
          <button type="button" onClick={onClose} className="p-1 text-zinc-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3.5 text-xs">
          {!user && (
            <div className="rounded border border-blue-500/30 bg-blue-500/10 p-3 text-blue-300 flex items-center justify-between gap-2">
              <span>Sign in to save personal study notes to your SQLite workspace.</span>
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="font-medium text-white underline whitespace-nowrap"
              >
                Sign In
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 mb-1">Note Type</label>
              <select
                value={targetType}
                onChange={(e) => setTargetType(e.target.value as NoteTargetType)}
                className="w-full rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1.5 text-zinc-200 focus:border-blue-500 focus:outline-none"
              >
                <option value="question">Question Note</option>
                <option value="concept">Concept Note</option>
                <option value="interview">Interview Note</option>
                <option value="pattern">Coding Pattern</option>
              </select>
            </div>
            <div>
              <label className="block text-zinc-400 mb-1">Reference Slug / Topic</label>
              <input
                type="text"
                value={targetRef}
                onChange={(e) => setTargetRef(e.target.value)}
                placeholder="e.g. decorators, two-sum..."
                className="w-full rounded border border-zinc-800 bg-[#0B0D11] px-2.5 py-1.5 text-zinc-200 focus:border-blue-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Title</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Key insight or pattern summary..."
              className="w-full rounded border border-zinc-800 bg-[#0B0D11] px-3 py-1.5 text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Notes</label>
            <textarea
              required
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write implementation takeaways, edge cases, or Python gotchas..."
              className="w-full rounded border border-zinc-800 bg-[#0B0D11] p-3 text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-zinc-400 mb-1">Tags (comma separated)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="python, edge-cases, functools"
              className="w-full rounded border border-zinc-800 bg-[#0B0D11] px-3 py-1.5 text-zinc-200 focus:border-blue-500 focus:outline-none"
            />
          </div>

          {createMutation.isError && (
            <div className="text-rose-400">{(createMutation.error as Error).message}</div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-zinc-800 bg-[#0B0D11] px-3.5 py-1.5 text-zinc-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="rounded bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-4 py-1.5 font-medium text-white"
            >
              {createMutation.isPending ? 'Saving...' : 'Save Note'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
