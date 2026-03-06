import { FileTree } from '../file-tree/FileTree';
import { SourceEditor } from '../editor/SourceEditor';
import { PreviewPane } from '../editor/PreviewPane';
import { SplitPane } from './SplitPane';
import { Toolbar, EditorMode, Theme } from './Toolbar';
import { ErrorBoundary } from '../ErrorBoundary';
import { SaveState } from '../../hooks/useActiveFile';
import type { FileKind } from '../../lib/markdown';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

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
  onRenameFile: (path: string) => Promise<void> | void;
  activeFile: string | null;
  activeFileKind: FileKind | null;
  activeFileEditable: boolean;
  readonlyReason: string | null;
  content: string;
  saveState: SaveState;
  mode: EditorMode;
  sourceSplitEnabled: boolean;
  theme: Theme;
  syncScroll: boolean;
  sidebarVisible: boolean;
  expandedDirs: string[];
  onSelectFile: (path: string) => Promise<void> | void;
  onContentChange: (text: string) => void;
  onModeChange: (mode: EditorMode) => void;
  onToggleSourceSplit: () => void;
  onThemeToggle: () => void;
  onToggleSyncScroll: () => void;
  onToggleSidebar: () => void;
  onExpandedDirsChange: (paths: string[]) => void;
  onSave: () => void;
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
  onRenameFile,
  activeFile,
  activeFileKind,
  activeFileEditable,
  readonlyReason,
  content,
  saveState,
  mode,
  sourceSplitEnabled,
  theme,
  syncScroll,
  sidebarVisible,
  expandedDirs,
  onSelectFile,
  onContentChange,
  onModeChange,
  onToggleSourceSplit,
  onThemeToggle,
  onToggleSyncScroll,
  onToggleSidebar,
  onExpandedDirsChange,
  onSave,
}: AppLayoutProps) {
  const previewKind: FileKind = activeFileKind ?? 'markdown';
  const isMarkdownFile = previewKind === 'markdown';
  const enableSplitPane = mode === 'source' && isMarkdownFile && sourceSplitEnabled;

  const editorArea = activeFile ? (
    <div className="flex flex-col h-full">
      {enableSplitPane ? (
        <SplitPane
          syncScroll={syncScroll}
          left={<SourceEditor content={content} onChange={onContentChange} filePath={activeFile} readOnly={!activeFileEditable} />}
          right={<PreviewPane content={content} filePath={activeFile} fileKind={previewKind} theme={theme} />}
        />
      ) : mode === 'source' ? (
        <SourceEditor content={content} onChange={onContentChange} filePath={activeFile} readOnly={!activeFileEditable} />
      ) : (
        <PreviewPane content={content} filePath={activeFile} fileKind={previewKind} theme={theme} />
      )}
    </div>
  ) : (
    <WelcomeCard />
  );

  return (
    <div className="relative flex h-full" style={{ backgroundColor: 'var(--bg-base)' }}>
      {sidebarVisible && (
        <div className="w-64 flex-shrink-0 border-r" style={{ borderColor: 'var(--bg-divider)' }}>
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
              onRenameFile={onRenameFile}
              expandedDirs={expandedDirs}
              onExpandedDirsChange={onExpandedDirsChange}
              onSelectFile={onSelectFile}
              activeFile={activeFile}
            />
          </ErrorBoundary>
        </div>
      )}

      <div className="flex flex-col flex-1 min-w-0">
        <Toolbar
          mode={mode}
          onModeChange={onModeChange}
          activeFileKind={activeFileKind}
          isMarkdownFile={isMarkdownFile}
          sourceSplitEnabled={sourceSplitEnabled}
          onToggleSourceSplit={onToggleSourceSplit}
          isEditable={activeFileEditable}
          readonlyReason={readonlyReason}
          theme={theme}
          onThemeToggle={onThemeToggle}
          syncScroll={syncScroll}
          onToggleSyncScroll={onToggleSyncScroll}
          saveState={saveState}
          onSave={onSave}
          fileName={activeFile}
        />
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary fallback={
            <div className="p-8 text-center" style={{ color: 'var(--accent-error)' }}>Editor unavailable, please reload.</div>
          }>
            {editorArea}
          </ErrorBoundary>
        </div>
      </div>

      <button
        onClick={onToggleSidebar}
        title={sidebarVisible ? 'Hide explorer' : 'Show explorer'}
        aria-label={sidebarVisible ? 'Hide explorer' : 'Show explorer'}
        className="absolute top-2 p-1 rounded border"
        style={{
          left: sidebarVisible ? '16rem' : '0.25rem',
          transform: sidebarVisible ? 'translateX(-50%)' : 'none',
          borderColor: 'var(--bg-divider)',
          backgroundColor: 'var(--bg-surface)',
          color: 'var(--text-secondary)',
          zIndex: 30,
        }}
      >
        {sidebarVisible ? <PanelLeftClose size={13} /> : <PanelLeftOpen size={13} />}
      </button>
    </div>
  );
}
