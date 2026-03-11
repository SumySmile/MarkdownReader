import { useState } from 'react';
import { Table2, ListTodo, SquareCode, FoldVertical, UnfoldVertical } from 'lucide-react';
import { FileTree } from '../file-tree/FileTree';
import { SourceEditor } from '../editor/SourceEditor';
import type { MarkdownActionType, MarkdownEditorAction } from '../editor/SourceEditor';
import { PreviewPane } from '../editor/PreviewPane';
import { SplitPane } from './SplitPane';
import { Toolbar, EditorMode, Theme } from './Toolbar';
import { ErrorBoundary } from '../ErrorBoundary';
import { SaveState } from '../../hooks/useActiveFile';
import type { FileKind } from '../../lib/markdown';

interface AppLayoutProps {
  pinnedDirs: string[];
  pinnedFiles: string[];
  starredFiles: string[];
  filesPanelOpen: boolean;
  onPinDir: (path: string) => void;
  onUnpinDir: (path: string) => void;
  onAddFiles: () => Promise<void> | void;
  onToggleFileStar: (path: string) => void;
  onToggleFilesPanel: () => void;
  onRemovePinnedFile: (path: string) => Promise<void> | void;
  onRemoveOtherPinnedFiles: (path: string) => Promise<void> | void;
  onClearUnstarredFiles: () => Promise<void> | void;
  onCopyFullPath: (path: string) => Promise<void> | void;
  onCopyDirectoryPath: (path: string) => Promise<void> | void;
  onOpenContainingFolder: (path: string) => Promise<void> | void;
  onOpenDirectory: (path: string) => Promise<void> | void;
  onCreateFile: (dirPath: string, fileName: string) => Promise<void> | void;
  onRenameFile: (path: string, nextBaseName: string) => Promise<void> | void;
  onDuplicateFile: (path: string, nextBaseName: string) => Promise<void> | void;
  onDeleteFile: (path: string) => Promise<void> | void;
  activeFile: string | null;
  activeFileKind: FileKind | null;
  activeFileEditable: boolean;
  readonlyReason: string | null;
  openErrorMessage: string | null;
  content: string;
  saveState: SaveState;
  isOpening: boolean;
  openingFile: string | null;
  mode: EditorMode;
  sourceSplitEnabled: boolean;
  markdownToolsCollapsed: boolean;
  theme: Theme;
  syncScroll: boolean;
  sidebarVisible: boolean;
  expandedDirs: string[];
  onSelectFile: (path: string) => Promise<void> | void;
  onContentChange: (text: string) => void;
  onModeChange: (mode: EditorMode) => void;
  onToggleSourceSplit: () => void;
  onToggleMarkdownToolsCollapsed: () => void;
  onThemeToggle: () => void;
  onToggleSyncScroll: () => void;
  onToggleSidebar: () => void;
  onExpandedDirsChange: (paths: string[]) => void;
  onSave: () => void;
  contentZoomPct: number;
  getSourceScrollPosition: (path: string) => number;
  setSourceScrollPosition: (path: string, top: number) => void;
  getPreviewScrollPosition: (path: string) => number;
  setPreviewScrollPosition: (path: string, top: number) => void;
}

function WelcomeCard() {
  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>MarkdownEditor</h2>
      <p className="text-sm mb-6">Open a file from the sidebar to start editing</p>
      <div className="text-xs space-y-1.5 text-left bg-[var(--bg-surface)] rounded p-4">
        <p><kbd className="bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[10px]">Ctrl+S</kbd> Save</p>
        <p><kbd className="bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[10px]">Ctrl+\</kbd> Toggle Source / Preview</p>
        <p><kbd className="bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[10px]">Ctrl+O</kbd> Open file</p>
        <p><kbd className="bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[10px]">Ctrl+F</kbd> Focus search</p>
        <p><kbd className="bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[10px]">Ctrl+Alt+T/L/K</kbd> Markdown inserts</p>
      </div>
    </div>
  );
}

export function AppLayout({
  pinnedDirs,
  pinnedFiles,
  starredFiles,
  filesPanelOpen,
  onPinDir,
  onUnpinDir,
  onAddFiles,
  onToggleFileStar,
  onToggleFilesPanel,
  onRemovePinnedFile,
  onRemoveOtherPinnedFiles,
  onClearUnstarredFiles,
  onCopyFullPath,
  onCopyDirectoryPath,
  onOpenContainingFolder,
  onOpenDirectory,
  onCreateFile,
  onRenameFile,
  onDuplicateFile,
  onDeleteFile,
  activeFile,
  activeFileKind,
  activeFileEditable,
  readonlyReason,
  openErrorMessage,
  content,
  saveState,
  isOpening,
  openingFile,
  mode,
  sourceSplitEnabled,
  markdownToolsCollapsed,
  theme,
  syncScroll,
  sidebarVisible,
  expandedDirs,
  onSelectFile,
  onContentChange,
  onModeChange,
  onToggleSourceSplit,
  onToggleMarkdownToolsCollapsed,
  onThemeToggle,
  onToggleSyncScroll,
  onToggleSidebar,
  onExpandedDirsChange,
  onSave,
  contentZoomPct,
  getSourceScrollPosition,
  setSourceScrollPosition,
  getPreviewScrollPosition,
  setPreviewScrollPosition,
}: AppLayoutProps) {
  const [editorErrorNonce, setEditorErrorNonce] = useState(0);
  const [editorErrorMessage, setEditorErrorMessage] = useState<string | null>(null);
  const [markdownAction, setMarkdownAction] = useState<MarkdownEditorAction | null>(null);
  const previewKind: FileKind = activeFileKind ?? 'markdown';
  const isMarkdownFile = previewKind === 'markdown';
  const enableSplitPane = mode === 'source' && isMarkdownFile && sourceSplitEnabled;
  const showMarkdownActionBar = !!activeFile && mode === 'source' && isMarkdownFile;
  const openingFileName = openingFile ? openingFile.split(/[\\/]/).pop() ?? openingFile : 'file';
  const triggerMarkdownAction = (type: MarkdownActionType) => {
    setMarkdownAction({ type, seq: Date.now() });
  };

  const editorArea = isOpening ? (
    <div className="flex h-full items-center justify-center" style={{ color: 'var(--text-muted)' }}>
      <div className="text-sm">Opening {openingFileName}...</div>
    </div>
  ) : activeFile ? (
    <div className="flex flex-col h-full">
      {enableSplitPane ? (
        <SplitPane
          syncScroll={syncScroll}
          left={
            <SourceEditor
              content={content}
              onChange={onContentChange}
              filePath={activeFile}
              readOnly={!activeFileEditable}
              markdownAction={markdownAction}
              contentZoomPct={contentZoomPct}
              getScrollPosition={getSourceScrollPosition}
              setScrollPosition={setSourceScrollPosition}
            />
          }
          right={
            <PreviewPane
              content={content}
              filePath={activeFile}
              fileKind={previewKind}
              theme={theme}
              contentZoomPct={contentZoomPct}
              getScrollPosition={getPreviewScrollPosition}
              setScrollPosition={setPreviewScrollPosition}
            />
          }
        />
      ) : mode === 'source' ? (
        <SourceEditor
          content={content}
          onChange={onContentChange}
          filePath={activeFile}
          readOnly={!activeFileEditable}
          markdownAction={markdownAction}
          contentZoomPct={contentZoomPct}
          getScrollPosition={getSourceScrollPosition}
          setScrollPosition={setSourceScrollPosition}
        />
      ) : (
        <PreviewPane
          content={content}
          filePath={activeFile}
          fileKind={previewKind}
          theme={theme}
          contentZoomPct={contentZoomPct}
          getScrollPosition={getPreviewScrollPosition}
          setScrollPosition={setPreviewScrollPosition}
        />
      )}
    </div>
  ) : (
    <WelcomeCard />
  );

  return (
    <div className="relative flex h-full" style={{ backgroundColor: 'var(--bg-base)' }}>
      <div
        className={`flex-shrink-0 overflow-hidden border-r transition-[width,opacity] duration-150 ${sidebarVisible ? 'w-64 opacity-100' : 'w-0 opacity-0 pointer-events-none'}`}
        style={{ borderColor: 'var(--bg-divider)' }}
      >
        <div className="h-full w-64">
          <ErrorBoundary fallback={
            <div className="p-4 text-sm" style={{ color: 'var(--accent-error)' }}>Sidebar error</div>
          }>
            <FileTree
              pinnedDirs={pinnedDirs}
              pinnedFiles={pinnedFiles}
              starredFiles={starredFiles}
              filesPanelOpen={filesPanelOpen}
              onPinDir={onPinDir}
              onUnpinDir={onUnpinDir}
              onAddFiles={onAddFiles}
              onToggleFileStar={onToggleFileStar}
              onToggleFilesPanel={onToggleFilesPanel}
              onRemovePinnedFile={onRemovePinnedFile}
              onRemoveOtherPinnedFiles={onRemoveOtherPinnedFiles}
              onClearUnstarredFiles={onClearUnstarredFiles}
              onCopyFullPath={onCopyFullPath}
              onCopyDirectoryPath={onCopyDirectoryPath}
              onOpenContainingFolder={onOpenContainingFolder}
              onOpenDirectory={onOpenDirectory}
              onCreateFile={onCreateFile}
              onRenameFile={onRenameFile}
              onDuplicateFile={onDuplicateFile}
              onDeleteFile={onDeleteFile}
              expandedDirs={expandedDirs}
              onExpandedDirsChange={onExpandedDirsChange}
              onSelectFile={onSelectFile}
              activeFile={activeFile}
            />
          </ErrorBoundary>
        </div>
      </div>

      <div className="flex flex-col flex-1 min-w-0">
        <Toolbar
          mode={mode}
          onModeChange={onModeChange}
          activeFileKind={activeFileKind}
          isMarkdownFile={isMarkdownFile}
          sourceSplitEnabled={sourceSplitEnabled}
          markdownToolsCollapsed={markdownToolsCollapsed}
          onToggleSourceSplit={onToggleSourceSplit}
          onToggleMarkdownToolsCollapsed={onToggleMarkdownToolsCollapsed}
          isEditable={activeFileEditable}
          readonlyReason={readonlyReason}
          theme={theme}
          onThemeToggle={onThemeToggle}
          syncScroll={syncScroll}
          onToggleSyncScroll={onToggleSyncScroll}
          saveState={saveState}
          onSave={onSave}
          fileName={activeFile}
          onMarkdownAction={triggerMarkdownAction}
        />
        {openErrorMessage && (
          <div
            className="px-3 py-1.5 text-xs border-b"
            style={{
              color: 'var(--accent-error)',
              borderColor: 'var(--bg-divider)',
              backgroundColor: 'var(--bg-overlay)',
            }}
          >
            {openErrorMessage}
          </div>
        )}
        {showMarkdownActionBar && !markdownToolsCollapsed && (
            <div
              className="flex items-center px-3 py-1 border-b"
              style={{ borderColor: 'var(--bg-divider)', backgroundColor: 'var(--bg-base)' }}
            >
              <div className="flex items-center gap-1">
                <button
                  onClick={() => triggerMarkdownAction('insert-table')}
                  title="Insert table (Ctrl+Alt+T)"
                  aria-label="Insert table"
                  className="p-1.5 rounded hover:bg-[var(--bg-overlay)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <Table2 size={13} />
                </button>
                <button
                  onClick={() => triggerMarkdownAction('insert-task-list')}
                  title="Insert task list (Ctrl+Alt+L)"
                  aria-label="Insert task list"
                  className="p-1.5 rounded hover:bg-[var(--bg-overlay)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <ListTodo size={13} />
                </button>
                <button
                  onClick={() => triggerMarkdownAction('insert-code-block')}
                  title="Insert code block (Ctrl+Alt+K)"
                  aria-label="Insert code block"
                  className="p-1.5 rounded hover:bg-[var(--bg-overlay)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <SquareCode size={13} />
                </button>
                <span
                  className="mx-1 h-4 w-px"
                  style={{ backgroundColor: 'var(--bg-divider)' }}
                  aria-hidden="true"
                />
                <button
                  onClick={() => triggerMarkdownAction('fold-heading')}
                  title="Fold heading at cursor (Ctrl+Alt+F)"
                  aria-label="Fold heading"
                  className="p-1.5 rounded hover:bg-[var(--bg-overlay)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <FoldVertical size={13} />
                </button>
                <button
                  onClick={() => triggerMarkdownAction('unfold-all')}
                  title="Unfold all headings (Ctrl+Alt+U)"
                  aria-label="Unfold all headings"
                  className="p-1.5 rounded hover:bg-[var(--bg-overlay)]"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <UnfoldVertical size={13} />
                </button>
              </div>
            </div>
        )}
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary
            resetKeys={[activeFile, mode, sourceSplitEnabled, theme, editorErrorNonce]}
            onError={(error) => {
              setEditorErrorMessage(error.message || 'Unknown editor error');
            }}
            fallback={({ reset, error }) => (
              <div className="p-8 text-center flex h-full flex-col items-center justify-center gap-3" style={{ color: 'var(--accent-error)' }}>
                <div>Editor unavailable.</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {error?.message || editorErrorMessage || 'Please reload editor.'}
                </div>
                <button
                  className="px-3 py-1.5 rounded text-xs border"
                  style={{ borderColor: 'var(--bg-divider)', color: 'var(--text-secondary)' }}
                  onClick={() => {
                    setEditorErrorMessage(null);
                    reset();
                    setEditorErrorNonce(n => n + 1);
                  }}
                >
                  Reload Editor
                </button>
              </div>
            )}
          >
            {editorArea}
          </ErrorBoundary>
        </div>
      </div>

      <div
        className={`sidebar-rail ${sidebarVisible ? 'is-open' : 'is-collapsed'}`}
        style={{ left: sidebarVisible ? '16rem' : '0' }}
      >
        <button
          onClick={onToggleSidebar}
          title={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
          aria-label={sidebarVisible ? 'Hide Sidebar' : 'Show Sidebar'}
          className={`sidebar-handle ${sidebarVisible ? '' : 'is-collapsed'}`}
        >
          <span className="sidebar-handle-arrow" aria-hidden="true">
            {sidebarVisible ? '\u2039' : '\u203a'}
          </span>
        </button>
      </div>
    </div>
  );
}
