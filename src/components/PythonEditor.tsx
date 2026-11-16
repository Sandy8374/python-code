import { useEffect, useRef, useState } from 'react';
import Editor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { RotateCcw, Save, Play, Send, Minus, Plus, Loader2, AlertTriangle } from 'lucide-react';
import type { PyodideRuntimeStatus } from '../lib/pyodideRunner';

// Configure Monaco locally from node_modules so no external CDN is required
loader.config({ monaco });

interface PythonEditorProps {
  value: string;
  onChange: (nextCode: string) => void;
  onRun: () => void;
  onSubmit: () => void;
  onSave: () => void;
  onReset: () => void;
  isRunning: boolean;
  isSubmitting: boolean;
  isSaving: boolean;
  lastSavedText?: string;
  runtimeStatus: PyodideRuntimeStatus;
  pythonVersion: string | null;
  runtimeError: string | null;
  onRetryRuntime?: () => void;
}

export function getEditorPreferences(): { fontSize: number; tabSize: number; minimap: boolean } {
  try {
    const raw = localStorage.getItem('pm_editor_prefs');
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{ fontSize: number; tabSize: number; minimap: boolean }>;
      return {
        fontSize: typeof parsed.fontSize === 'number' ? parsed.fontSize : 14,
        tabSize: typeof parsed.tabSize === 'number' ? parsed.tabSize : 4,
        minimap: Boolean(parsed.minimap),
      };
    }
  } catch {
    // ignore storage errors
  }
  return { fontSize: 14, tabSize: 4, minimap: false };
}

export function saveEditorPreferences(prefs: { fontSize: number; tabSize: number; minimap: boolean }) {
  try {
    localStorage.setItem('pm_editor_prefs', JSON.stringify(prefs));
  } catch {
    // ignore
  }
}

export function PythonEditor({
  value,
  onChange,
  onRun,
  onSubmit,
  onSave,
  onReset,
  isRunning,
  isSubmitting,
  isSaving,
  lastSavedText,
  runtimeStatus,
  pythonVersion,
  runtimeError,
  onRetryRuntime,
}: PythonEditorProps) {
  const [prefs, setPrefs] = useState(getEditorPreferences);
  const [confirmReset, setConfirmReset] = useState(false);

  const onRunRef = useRef(onRun);
  const onSubmitRef = useRef(onSubmit);
  const onSaveRef = useRef(onSave);
  const runtimeReadyRef = useRef(runtimeStatus === 'ready');

  useEffect(() => {
    onRunRef.current = onRun;
    onSubmitRef.current = onSubmit;
    onSaveRef.current = onSave;
    runtimeReadyRef.current = runtimeStatus === 'ready';
  }, [onRun, onSubmit, onSave, runtimeStatus]);

  const handleMount: OnMount = (editor, monacoInstance) => {
    monacoInstance.editor.defineTheme('python-mastery-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '64748b', fontStyle: 'italic' },
        { token: 'keyword', foreground: '60a5fa' },
        { token: 'string', foreground: '34d399' },
        { token: 'number', foreground: 'fbbf24' },
      ],
      colors: {
        'editor.background': '#0C0E12',
        'editor.lineHighlightBackground': '#141821',
        'editorLineNumber.foreground': '#475569',
        'editorLineNumber.activeForeground': '#94a3b8',
        'editor.selectionBackground': '#1d4ed844',
        'editorCursor.foreground': '#3b82f6',
      },
    });
    monacoInstance.editor.setTheme('python-mastery-dark');

    // Keyboard shortcuts: Ctrl/Cmd+Enter = Run, Ctrl/Cmd+Shift+Enter = Submit, Ctrl/Cmd+S = Save
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.Enter, () => {
      if (runtimeReadyRef.current) onRunRef.current();
    });
    editor.addCommand(
      monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyMod.Shift | monacoInstance.KeyCode.Enter,
      () => {
        if (runtimeReadyRef.current) onSubmitRef.current();
      }
    );
    editor.addCommand(monacoInstance.KeyMod.CtrlCmd | monacoInstance.KeyCode.KeyS, () => {
      onSaveRef.current();
    });
  };

  const adjustFontSize = (delta: number) => {
    const next = Math.min(20, Math.max(12, prefs.fontSize + delta));
    const updated = { ...prefs, fontSize: next };
    setPrefs(updated);
    saveEditorPreferences(updated);
  };

  const isRuntimeReady = runtimeStatus === 'ready';

  return (
    <div className="flex flex-col h-full bg-[#0C0E12] min-h-0">
      {/* Editor Toolbar */}
      <div className="h-11 px-3 border-b border-zinc-800/80 bg-[#11141B] flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {runtimeStatus === 'ready' ? (
            <span className="text-xs font-mono font-medium text-emerald-400 whitespace-nowrap">
              {pythonVersion || 'Python 3'} · Pyodide Ready
            </span>
          ) : runtimeStatus === 'error' ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex items-center gap-1 text-xs font-mono text-rose-400 whitespace-nowrap">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Runtime Error
              </span>
              {onRetryRuntime && (
                <button
                  type="button"
                  onClick={onRetryRuntime}
                  className="text-[11px] font-medium text-blue-400 hover:text-blue-300 whitespace-nowrap"
                >
                  Retry
                </button>
              )}
            </div>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs font-mono text-blue-400 whitespace-nowrap">
              <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
              Initializing Python WASM...
            </span>
          )}

          <div className="hidden sm:flex items-center gap-1 border border-zinc-800 rounded px-1.5 py-0.5 bg-[#0C0E12]">
            <button
              type="button"
              onClick={() => adjustFontSize(-1)}
              aria-label="Decrease font size"
              className="p-0.5 text-zinc-400 hover:text-white"
            >
              <Minus className="h-3 w-3" />
            </button>
            <span className="text-[11px] font-mono text-zinc-300 tabular-nums px-1">{prefs.fontSize}px</span>
            <button
              type="button"
              onClick={() => adjustFontSize(1)}
              aria-label="Increase font size"
              className="p-0.5 text-zinc-400 hover:text-white"
            >
              <Plus className="h-3 w-3" />
            </button>
          </div>
          {lastSavedText && (
            <span className="hidden md:inline text-[11px] text-zinc-500 truncate">{lastSavedText}</span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {confirmReset ? (
            <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-700 rounded-md px-2 py-1">
              <span className="text-[11px] text-zinc-300 whitespace-nowrap">Reset code?</span>
              <button
                type="button"
                onClick={() => {
                  onReset();
                  setConfirmReset(false);
                }}
                className="text-[11px] font-medium text-rose-400 hover:text-rose-300 whitespace-nowrap"
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirmReset(false)}
                className="text-[11px] text-zinc-400 hover:text-zinc-200 whitespace-nowrap"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              title="Reset starter code"
              className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#14171D] hover:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 whitespace-nowrap shrink-0 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span className="hidden xl:inline">Reset</span>
            </button>
          )}

          <button
            type="button"
            onClick={onSave}
            disabled={isSaving}
            title="Save draft (Ctrl+S)"
            className="inline-flex items-center gap-1 rounded-md border border-zinc-800 bg-[#14171D] hover:bg-zinc-800 disabled:opacity-50 px-2.5 py-1.5 text-xs text-zinc-300 whitespace-nowrap shrink-0 transition-colors"
          >
            <Save className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">{isSaving ? 'Saving...' : 'Save'}</span>
          </button>

          <button
            type="button"
            onClick={onRun}
            disabled={!isRuntimeReady || isRunning || isSubmitting}
            title={isRuntimeReady ? 'Run public tests (Ctrl+Enter)' : 'Waiting for Pyodide Python runtime to initialize...'}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-xs font-medium text-zinc-100 whitespace-nowrap shrink-0 transition-colors"
          >
            <Play className="h-3.5 w-3.5 text-blue-400" />
            {isRunning ? 'Running...' : 'Run'}
          </button>

          <button
            type="button"
            onClick={onSubmit}
            disabled={!isRuntimeReady || isRunning || isSubmitting}
            title={isRuntimeReady ? 'Submit against all test cases (Ctrl+Shift+Enter)' : 'Waiting for Pyodide Python runtime to initialize...'}
            className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed px-3.5 py-1.5 text-xs font-semibold text-white whitespace-nowrap shrink-0 transition-colors"
          >
            <Send className="h-3.5 w-3.5" />
            {isSubmitting ? 'Evaluating...' : 'Submit'}
          </button>
        </div>
      </div>

      {runtimeStatus === 'error' && runtimeError && (
        <div className="px-3 py-2 border-b border-rose-500/30 bg-rose-500/10 flex items-center justify-between gap-2 text-xs text-rose-300 shrink-0">
          <span className="truncate">Python WebAssembly Initialization Error: {runtimeError}</span>
          {onRetryRuntime && (
            <button
              type="button"
              onClick={onRetryRuntime}
              className="rounded border border-rose-500/40 px-2 py-0.5 text-[11px] font-medium text-rose-200 hover:bg-rose-500/20 whitespace-nowrap shrink-0"
            >
              Retry Runtime
            </button>
          )}
        </div>
      )}

      {/* Monaco Editor Surface */}
      <div className="flex-1 min-h-0">
        <Editor
          height="100%"
          defaultLanguage="python"
          value={value}
          onChange={(v) => onChange(v ?? '')}
          onMount={handleMount}
          theme="vs-dark"
          options={{
            fontSize: prefs.fontSize,
            tabSize: prefs.tabSize,
            insertSpaces: true,
            fontFamily: "'Cascadia Code', 'Consolas', 'JetBrains Mono', monospace",
            fontLigatures: true,
            minimap: { enabled: prefs.minimap },
            scrollBeyondLastLine: false,
            automaticLayout: true,
            autoIndent: 'full',
            bracketPairColorization: { enabled: true },
            lineNumbers: 'on',
            padding: { top: 12, bottom: 12 },
            smoothScrolling: true,
            renderLineHighlight: 'line',
            wordWrap: 'off',
          }}
        />
      </div>
    </div>
  );
}
