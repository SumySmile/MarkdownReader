import { FileTree } from '../file-tree/FileTree';
import { SourceEditor } from '../editor/SourceEditor';
import { PreviewPane } from '../editor/PreviewPane';
import { WysiwygEditor, WysiwygEditorHandle } from '../editor/WysiwygEditor';
import { SplitPane } from './SplitPane';
import { Toolbar, EditorMode, Theme } from './Toolbar';
import { ErrorBoundary } from '../ErrorBoundary';
import { SaveState } from '../../hooks/useActiveFile';

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
  activeFile: string | null;
  content: string;
  saveState: SaveState;
  isDirty: boolean;
  mode: EditorMode;
  theme: Theme;
  syncScroll: boolean;
  onSelectFile: (path: string) => Promise<void> | void;
  onContentChange: (text: string) => void;
  onModeChange: (mode: EditorMode) => void;
  onThemeToggle: () => void;
  onToggleSyncScroll: () => void;
  onSave: () => void;
  wysiwygRef: React.RefObject<WysiwygEditorHandle | null>;
}

function WelcomeCard() {
  return (
    <div className="flex flex-col items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
      <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Pastel Markdown Editor</h2>
      <p className="text-sm mb-6">Open a file from the sidebar to start editing</p>
      <div className="text-xs space-y-1.5 text-left bg-[var(--bg-surface)] rounded p-4">
        <p><kbd className="bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[10px]">Ctrl+S</kbd> Save</p>
        <p><kbd className="bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[10px]">Ctrl+\</kbd> Toggle Source / Split</p>
        <p><kbd className="bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[10px]">Ctrl+O</kbd> Open file</p>
        <p><kbd className="bg-[var(--bg-overlay)] px-1.5 py-0.5 rounded text-[10px]">Ctrl+F</kbd> Focus search</p>
      </div>
    </div>
  );
}

export function AppLayout({
  pinnedDirs, pinnedFiles, starredFiles, filesPanelOpen, onPinDir, onUnpinDir, onAddFiles, onToggleFileStar, onToggleFilesPanel, activeFile, content, saveState, isDirty,
  mode, theme, syncScroll, onSelectFile, onContentChange, onModeChange, onThemeToggle, onToggleSyncScroll, onSave, wysiwygRef,
}: AppLayoutProps) {
  const editorArea = activeFile ? (
    <>
      {/* Source + Preview (CSS visibility) */}
      <div style={{ display: (mode !== 'source' && mode !== 'split' && mode !== 'preview') ? 'none' : undefined }} className="flex flex-col h-full">
        {mode === 'split' ? (
          <SplitPane
            syncScroll={syncScroll}
            left={<SourceEditor content={content} onChange={onContentChange} />}
            right={<PreviewPane content={content} filePath={activeFile} theme={theme} />}
          />
        ) : mode === 'source' ? (
          <SourceEditor content={content} onChange={onContentChange} />
        ) : (
          <PreviewPane content={content} filePath={activeFile} theme={theme} />
        )}
      </div>

      {/* WYSIWYG — always mounted, shown only in wysiwyg mode (future: add wysiwyg to EditorMode) */}
      <div style={{ display: 'none' }}>
        <ErrorBoundary fallback={null}>
          <WysiwygEditor ref={wysiwygRef} content={content} onChange={onContentChange} />
        </ErrorBoundary>
      </div>
    </>
  ) : (
    <WelcomeCard />
  );

  return (
    <div className="flex h-full" style={{ backgroundColor: 'var(--bg-base)' }}>
      {/* Sidebar */}
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
            onSelectFile={onSelectFile}
            activeFile={activeFile}
          />
        </ErrorBoundary>
      </div>

      {/* Editor area */}
      <div className="flex flex-col flex-1 min-w-0">
        <Toolbar
          mode={mode}
          onModeChange={onModeChange}
          theme={theme}
          onThemeToggle={onThemeToggle}
          syncScroll={syncScroll}
          onToggleSyncScroll={onToggleSyncScroll}
          saveState={saveState}
          isDirty={isDirty}
          onSave={onSave}
          fileName={activeFile}
        />
        <div className="flex-1 overflow-hidden">
          <ErrorBoundary fallback={
            <div className="p-8 text-center" style={{ color: 'var(--accent-error)' }}>Editor unavailable — please reload.</div>
          }>
            {editorArea}
          </ErrorBoundary>
        </div>
      </div>
    </div>
  );
}
