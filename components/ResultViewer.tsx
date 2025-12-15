
import React, { useImperativeHandle, useRef, useState, useEffect } from 'react';
import Editor, { useMonaco } from '@monaco-editor/react';
import { StructuredTextViewer } from './StructuredTextViewer';
import { SideBySideViewer } from './SideBySideViewer';
import { DownloadIcon, SparklesIcon, CodeTagIcon, ShieldCheckIcon, UndoIcon, RedoIcon, EyeIcon, PencilIcon, LanguageIcon, WordWrapIcon, IndentIcon, DocumentMagnifyingGlassIcon } from './icons';
import type { SelectedSteps, ExtractionStats } from '../types';
import type { ApiCallTracker } from '../hooks/usePerformanceTracker';

export type ValidationReportItem = {
  line: number | null;
  text: string;
};

export type ResultViewerRef = {
  goToLine: (lineNumber: number) => void;
};

export type DownloadVersion = 'initial' | 'step1' | 'step1_5' | 'step2' | 'step3';

interface ResultViewerProps {
  fileName: string;
  currentText: string;
  onTextChange: (newText: string) => void;
  onDownload: () => void; 
  activeVersion: DownloadVersion;
  onVersionSelect: (version: DownloadVersion) => void;
  textAfterStep1: string | null;
  textAfterStep1_5?: string | null; 
  textAfterStep2: string | null;
  textAfterStep3: string | null;
  onConfigureHeadlines: () => void;
  onStartFootnotes?: () => void;
  onConfigureContent: () => void;
  onConfigureValidation: () => void;
  onUndo: () => void;
  onRedo?: () => void; // New Prop
  canRedo?: boolean;   // New Prop
  onReviewLastChange: () => void;
  canUndo: boolean;
  onReset: () => void;
  failedChunks: number[];
  isEditMode: boolean;
  onToggleEditMode: () => void;
  onGoToLine: (lineNumber: number) => void;
  onTranslate: () => Promise<void>;
  isTranslating: boolean;
  translatedText: string;
  documentLanguage: string;
  selectedSteps: SelectedSteps;
  onSetSelectedSteps: React.Dispatch<React.SetStateAction<SelectedSteps>>;
  onRunSequence: () => void;
  fullSessionLog: string[];
  totalElapsedTime: number;
  apiCallStats: ApiCallTracker;
  extractionStats: ExtractionStats | null;
}

const formatTime = (totalSeconds: number): string => {
    if (totalSeconds < 60) {
        return `${totalSeconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}m ${seconds}s`;
};

export const ResultViewer = React.forwardRef<ResultViewerRef, ResultViewerProps>(({
  fileName,
  currentText,
  onTextChange,
  onDownload,
  activeVersion,
  onVersionSelect,
  textAfterStep1,
  textAfterStep1_5,
  textAfterStep2,
  textAfterStep3,
  onConfigureHeadlines,
  onStartFootnotes,
  onConfigureContent,
  onConfigureValidation,
  onUndo,
  onRedo,
  canRedo,
  onReviewLastChange,
  canUndo,
  onReset,
  failedChunks,
  isEditMode,
  onToggleEditMode,
  onGoToLine,
  onTranslate,
  isTranslating,
  translatedText,
  documentLanguage,
  selectedSteps,
  onSetSelectedSteps,
  onRunSequence,
  fullSessionLog,
  totalElapsedTime,
  apiCallStats,
  extractionStats,
}, ref) => {
  // We use a Ref to store the Monaco editor instance
  const editorInstanceRef = useRef<any>(null);
  const [isTranslationVisible, setIsTranslationVisible] = useState(false);
  const [activeSidebarTab, setActiveSidebarTab] = useState<'tools' | 'log'>('tools');
  const [isWordWrapEnabled, setIsWordWrapEnabled] = useState(true);
  const [showDebugStats, setShowDebugStats] = useState(false);

  // Hook to configure Monaco (theme, language)
  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
        // Register custom language for our tags
        monaco.languages.register({ id: 'pdf-ocr' });
        
        // Define syntax highlighting rules
        monaco.languages.setMonarchTokensProvider('pdf-ocr', {
            tokenizer: {
                root: [
                    [/{{level0}}/, 'tag.level0'],
                    [/{{-level0}}/, 'tag.level0'],
                    [/{{level1}}/, 'tag.level1'],
                    [/{{-level1}}/, 'tag.level1'],
                    [/{{level2}}/, 'tag.level2'],
                    [/{{-level2}}/, 'tag.level2'],
                    [/{{level3}}/, 'tag.level3'],
                    [/{{-level3}}/, 'tag.level3'],
                    // Generic fallback for deeper levels
                    [/{{level\d+}}/, 'tag.level'],
                    [/{{-level\d+}}/, 'tag.level'],
                    
                    [/{{text_level}}/, 'tag.textlevel'],
                    [/{{-text_level}}/, 'tag.textlevel'],
                    
                    [/{{footnote\d+}}/, 'tag.footnote'],
                    [/{{-footnote\d+}}/, 'tag.footnote'],
                    [/{{footnotenumber\d+}}/, 'tag.footnote'],
                    [/{{-footnotenumber\d+}}/, 'tag.footnote'],
                    
                    [/\/\/.*/, 'comment'],
                ]
            }
        });

        // Define Dark Theme matching our app
        monaco.editor.defineTheme('pdf-ocr-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'tag.level0', foreground: 'F87171', fontStyle: 'bold' }, // red-400
                { token: 'tag.level1', foreground: 'FB923C', fontStyle: 'bold' }, // orange-400
                { token: 'tag.level2', foreground: 'FACC15', fontStyle: 'bold' }, // yellow-400
                { token: 'tag.level3', foreground: '22D3EE', fontStyle: 'bold' }, // cyan-400
                { token: 'tag.level', foreground: '4ADE80' }, // green-400 fallback
                { token: 'tag.textlevel', foreground: '9CA3AF' }, // gray-400
                { token: 'tag.footnote', foreground: 'C084FC' }, // purple-400
                { token: 'comment', foreground: '6B7280', fontStyle: 'italic' }, // gray-500
            ],
            colors: {
                'editor.background': '#111827', // gray-900
                'editor.lineHighlightBackground': '#1F2937', // gray-800
            }
        });
    }
  }, [monaco]);

  const handleEditorDidMount = (editor: any) => {
    editorInstanceRef.current = editor;
  };

  useImperativeHandle(ref, () => ({
    goToLine: (lineNumber: number) => {
      if (isEditMode && editorInstanceRef.current) {
        const editor = editorInstanceRef.current;
        // Monaco lines are 1-based
        editor.revealLineInCenter(lineNumber);
        editor.setPosition({ lineNumber, column: 1 });
        editor.focus();
      } else {
        const element = document.getElementById(`line-${lineNumber - 1}`); // structured viewer uses 0-based IDs usually, but let's check
        // StructuredTextViewer maps indices 0...N. So line 1 is index 0.
        // But let's check StructuredTextViewer implementation. 
        // It renders `id={`line-${lineIndex}`}`.
        const targetId = `line-${lineNumber - 1}`;
        const elementDom = document.getElementById(targetId);
        
        if (elementDom) {
          elementDom.scrollIntoView({ behavior: 'smooth', block: 'center' });
          elementDom.classList.add('line-highlight');
          setTimeout(() => {
            elementDom.classList.remove('line-highlight');
          }, 2000);
        }
      }
    },
  }));

  const handleSaveAndProceed = (configureFunction: () => void) => {
    configureFunction();
  };

  const handleTranslateClick = async () => {
    if (!translatedText) { 
      await onTranslate();
    }
    setIsTranslationVisible(prev => !prev);
  };

  const handleDiagramStructure = () => {
    if (!currentText) return;

    let processed = currentText;

    // 0. MERGE MULTI-LINE HEADLINES (Fix for "Diagram Tag")
    processed = processed.replace(/({{level\d+}})([\s\S]*?)({{-level\d+}})/g, (match, openTag, content, closeTag) => {
         const mergedContent = content.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
         return `${openTag}${mergedContent}${closeTag}`;
    });

    // 1. Force separate lines for opening tags
    processed = processed.replace(/([^\n])\s*({{level\d+}})/g, '$1\n$2');
    processed = processed.replace(/([^\n])\s*({{text_level}})/g, '$1\n$2');
    
    // 2. Force separate lines for closing tags
    processed = processed.replace(/({{-text_level}})\s*([^\n])/g, '$1\n$2');
    processed = processed.replace(/({{-level\d+}})\s*([^\n])/g, '$1\n$2');

    // 3. Ensure internal content of {{text_level}} isn't glued
    processed = processed.replace(/({{text_level}})([^\n])/g, '$1\n$2');
    
    // 4. Clean up multiple newlines
    processed = processed.replace(/\n{3,}/g, '\n\n');

    const lines = processed.split('\n');
    
    const indentedLines = lines.map(line => {
      const levelMatch = line.match(/{{level(\d+)}}/);
      if (levelMatch) {
        const level = parseInt(levelMatch[1], 10);
        const indentSize = level; 
        const indentation = ' '.repeat(indentSize);
        const trimmedLine = line.trimStart();
        return `${indentation}${trimmedLine}`;
      }
      return line;
    });

    const formattedText = indentedLines.join('\n');
    onTextChange(formattedText); 
  };

  const tabButtonClasses = (isActive: boolean) => 
    `flex-1 py-2 text-sm font-semibold transition-colors ${isActive ? 'bg-gray-800 text-white' : 'bg-gray-700 text-gray-400 hover:bg-gray-600/50'}`;

  const radioLabelClasses = (isDisabled: boolean) =>
    `flex items-center space-x-3 p-2 rounded-md transition-colors ${isDisabled ? 'cursor-not-allowed text-gray-500 bg-gray-800/50' : 'cursor-pointer hover:bg-gray-700/50 text-gray-300'}`;

  const getNextStepLabel = () => {
    if (selectedSteps.step1 && !textAfterStep1) return "Run Step 1 (Headlines)";
    if (selectedSteps.step1_5 && !textAfterStep1_5) return "Run Step 1.5 (Footnotes)";
    if (selectedSteps.step2 && !textAfterStep2) return "Run Step 2 (Content)";
    if (selectedSteps.step3 && !textAfterStep3) return "Run Step 3 (Audit)";
    return "All Selected Steps Complete";
  };

  const isSequenceComplete = 
    (!selectedSteps.step1 || !!textAfterStep1) &&
    (!selectedSteps.step1_5 || !!textAfterStep1_5) &&
    (!selectedSteps.step2 || !!textAfterStep2) &&
    (!selectedSteps.step3 || !!textAfterStep3);

  return (
    <div className="w-full max-w-7xl h-[85vh] bg-gray-800 rounded-xl shadow-2xl flex flex-col animate-fade-in relative">
      
      {showDebugStats && extractionStats && (
        <div className="absolute top-16 left-4 z-50 bg-gray-900 border border-teal-500/50 p-4 rounded-lg shadow-xl w-80 animate-fade-in text-sm font-mono">
          <div className="flex justify-between items-center mb-2 border-b border-gray-700 pb-2">
             <h4 className="font-bold text-teal-400">Extraction Debug</h4>
             <button onClick={() => setShowDebugStats(false)} className="text-gray-500 hover:text-white">&times;</button>
          </div>
          <div className="space-y-2 text-gray-300">
             <div className="flex justify-between"><span>Method:</span> <span className="text-white">{extractionStats.method}</span></div>
             <div className="flex justify-between"><span>Total Pages:</span> <span className="text-white">{extractionStats.totalPages}</span></div>
             <div className="flex justify-between"><span>Text Pages:</span> <span className="text-green-400">{extractionStats.textPages}</span></div>
             <div className="flex justify-between"><span>Image (OCR) Pages:</span> <span className="text-yellow-400">{extractionStats.imagePages}</span></div>
             <div className="flex justify-between"><span>Avg Chars/Page:</span> <span className="text-white">{Math.round(extractionStats.averageCharsPerPage)}</span></div>
          </div>
        </div>
      )}

      <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
        <div className="flex items-center space-x-3">
            <h2 className="text-lg font-bold text-white truncate max-w-xs" title={fileName}>{fileName}</h2>
            {extractionStats && (
                <button 
                    onClick={() => setShowDebugStats(!showDebugStats)}
                    className="p-1.5 bg-gray-700 hover:bg-teal-700/50 rounded text-teal-400 transition-colors"
                    title="View Extraction Debug Info"
                >
                    <DocumentMagnifyingGlassIcon className="w-4 h-4" />
                </button>
            )}
        </div>
        <div className="flex items-center space-x-2">
          {/* Main Undo/Redo for text editing */}
           <button 
                onClick={onUndo} 
                disabled={!canUndo}
                className="flex items-center px-3 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Undo Text Change"
            >
              <UndoIcon className="w-4 h-4" />
            </button>
            <button 
                onClick={onRedo} 
                disabled={!canRedo}
                className="flex items-center px-3 py-2 text-sm bg-gray-700 text-white rounded-md hover:bg-gray-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed mr-2"
                 title="Redo Text Change"
            >
              <RedoIcon className="w-4 h-4" />
            </button>

          <button onClick={onReviewLastChange} className="flex items-center px-3 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors">
            Review Changes
          </button>
          
          <button onClick={onReset} className="px-3 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-500 transition-colors">
            Process New File
          </button>
        </div>
      </header>

      <div className="flex flex-grow overflow-hidden">
        <main className="flex-1 flex flex-col min-w-0">
          <div className="flex-shrink-0 border-b border-gray-700 px-4 py-2 flex justify-between items-center bg-gray-900/50">
             <h3 className="text-sm font-medium text-gray-300">
                {isTranslationVisible ? 'Side-by-Side Comparison' : isEditMode ? 'Advanced Editor' : 'Structured Viewer'}
             </h3>
             {!isTranslationVisible && (
                <div className="flex items-center space-x-2">
                    <button
                        onClick={handleDiagramStructure}
                        className="flex items-center px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 hover:text-white transition-colors border border-gray-600"
                        title="Fix indentations and ensure tags are on new lines"
                    >
                        <IndentIcon className="w-4 h-4 mr-2" />
                        Diagram Tags
                    </button>
                    <button
                        onClick={() => setIsWordWrapEnabled(prev => !prev)}
                        className="flex items-center px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 hover:text-white transition-colors border border-gray-600"
                        title={isWordWrapEnabled ? 'Disable word wrap' : 'Enable word wrap'}
                    >
                        <WordWrapIcon className="w-4 h-4 mr-2" />
                        {isWordWrapEnabled ? 'Wrap On' : 'Wrap Off'}
                    </button>
                    <button
                        onClick={onToggleEditMode}
                        className={`flex items-center px-3 py-1 text-xs rounded-md transition-colors border ${isEditMode ? 'bg-teal-700 text-white border-teal-600' : 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-gray-600'}`}
                    >
                        {isEditMode ? (<><EyeIcon className="w-4 h-4 mr-2" />Visual Mode</>) : (<><PencilIcon className="w-4 h-4 mr-2" />Edit Text</>)}
                    </button>
                </div>
             )}
          </div>
          <div className="flex-grow relative overflow-auto">
            {isTranslationVisible ? (
                <SideBySideViewer 
                    originalText={currentText}
                    translatedText={translatedText}
                    originalLang={documentLanguage}
                    isWordWrapEnabled={isWordWrapEnabled}
                />
            ) : isEditMode ? (
              <div className="h-full w-full">
                  <Editor
                    height="100%"
                    defaultLanguage="pdf-ocr"
                    language="pdf-ocr" // Use our custom language
                    theme="pdf-ocr-dark" // Use our custom theme
                    value={currentText}
                    onChange={(value) => onTextChange(value || '')}
                    onMount={handleEditorDidMount}
                    options={{
                        minimap: { enabled: false },
                        wordWrap: isWordWrapEnabled ? 'on' : 'off',
                        scrollBeyondLastLine: false,
                        fontSize: 14,
                        fontFamily: 'monospace',
                        automaticLayout: true,
                        padding: { top: 16, bottom: 16 }
                    }}
                  />
              </div>
            ) : (
              <StructuredTextViewer text={currentText} isWordWrapEnabled={isWordWrapEnabled} />
            )}
          </div>
        </main>
        
        <aside className="w-96 border-l border-gray-700 flex flex-col flex-shrink-0">
            <div className="flex-shrink-0 border-b border-gray-700 flex">
                <button onClick={() => setActiveSidebarTab('tools')} className={tabButtonClasses(activeSidebarTab === 'tools')}>
                    Tools
                </button>
                <button onClick={() => setActiveSidebarTab('log')} className={tabButtonClasses(activeSidebarTab === 'log')}>
                    Session Log
                </button>
            </div>
            
            <div className="flex-grow overflow-y-auto">
                {activeSidebarTab === 'tools' && (
                    <div className="p-6 space-y-8">
                        {failedChunks.length > 0 && (
                            <div className="p-3 bg-yellow-900/50 border border-yellow-700 rounded-md">
                            <h4 className="font-semibold text-yellow-300">Warning</h4>
                            <p className="text-sm text-yellow-400 mt-1">
                                Processing failed for chunks: {failedChunks.join(', ')}. Original content was kept for these sections.
                            </p>
                            </div>
                        )}
                        
                        <div>
                            <h3 className="text-lg font-semibold text-gray-200 mb-4">Batch Processing</h3>
                            <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                                <p className="text-xs text-gray-400 text-center">Select steps to run in sequence.</p>
                                <div className="space-y-3 text-sm">
                                    <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-800 p-1 rounded">
                                        <input type="checkbox" checked={!!selectedSteps.step1} onChange={e => onSetSelectedSteps(s => ({...s, step1: e.target.checked}))} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-teal-500 focus:ring-teal-600"/>
                                        <span className={textAfterStep1 ? "text-green-400 line-through" : "text-gray-300"}>Step 1: Mark Headlines</span>
                                    </label>
                                    <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-800 p-1 rounded">
                                        <input type="checkbox" checked={!!selectedSteps.step1_5} onChange={e => onSetSelectedSteps(s => ({...s, step1_5: e.target.checked}))} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-teal-500 focus:ring-teal-600"/>
                                        <span className={textAfterStep1_5 ? "text-green-400 line-through" : "text-gray-300"}>Step 1.5: Mark Footnotes</span>
                                    </label>
                                    <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-800 p-1 rounded">
                                        <input type="checkbox" checked={!!selectedSteps.step2} onChange={e => onSetSelectedSteps(s => ({...s, step2: e.target.checked}))} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-teal-500 focus:ring-teal-600"/>
                                        <span className={textAfterStep2 ? "text-green-400 line-through" : "text-gray-300"}>Step 2: Structure Content</span>
                                    </label>
                                    <label className="flex items-center space-x-3 cursor-pointer hover:bg-gray-800 p-1 rounded">
                                        <input type="checkbox" checked={!!selectedSteps.step3} onChange={e => onSetSelectedSteps(s => ({...s, step3: e.target.checked}))} className="w-4 h-4 rounded bg-gray-700 border-gray-600 text-teal-500 focus:ring-teal-600"/>
                                        <span className={textAfterStep3 ? "text-green-400 line-through" : "text-gray-300"}>Step 3: Fix Structure</span>
                                    </label>
                                </div>
                                <button 
                                    onClick={onRunSequence} 
                                    disabled={isSequenceComplete}
                                    title={isSequenceComplete ? "Select pending steps above to run" : "Executes the next unchecked step"}
                                    className={`w-full flex items-center justify-center px-4 py-3 font-bold rounded-md transition-colors ${
                                        isSequenceComplete 
                                            ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                                            : 'bg-sky-600 text-white hover:bg-sky-500'
                                    }`}
                                >
                                    {isSequenceComplete ? "All Steps Done" : `Run Next: ${getNextStepLabel().replace("Run ", "")}`}
                                </button>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold text-gray-200 mb-4">Manual Execution</h3>
                            <div className="space-y-4">
                                <button 
                                    onClick={() => handleSaveAndProceed(onConfigureHeadlines)} 
                                    className={`w-full flex items-center justify-center px-4 py-3 font-bold rounded-md transition-colors ${!currentText ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-teal-700 text-white hover:bg-teal-600'} disabled:opacity-50`} 
                                    disabled={!currentText}
                                    title={!currentText ? "Please extract text first" : "Configure and run headline tagging"}
                                >
                                    <SparklesIcon className="w-5 h-5 mr-2" />
                                    {textAfterStep1 ? "Re-run Step 1" : "Configure Step 1"}
                                </button>
                                <button 
                                    onClick={() => handleSaveAndProceed(() => onStartFootnotes && onStartFootnotes())} 
                                    className={`w-full flex items-center justify-center px-4 py-3 font-bold rounded-md transition-colors ${!currentText ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-teal-700 text-white hover:bg-teal-600'} disabled:opacity-50`} 
                                    disabled={!currentText}
                                    title={!currentText ? "Please extract text first" : "Tag footnote references and bodies"}
                                >
                                    <SparklesIcon className="w-5 h-5 mr-2" />
                                    {textAfterStep1_5 ? "Re-run Step 1.5" : "Run Step 1.5 (Footnotes)"}
                                </button>
                                <button 
                                    onClick={() => handleSaveAndProceed(onConfigureContent)} 
                                    className={`w-full flex items-center justify-center px-4 py-3 font-bold rounded-md transition-colors ${!currentText ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-teal-700 text-white hover:bg-teal-600'} disabled:opacity-50`} 
                                    disabled={!currentText}
                                    title={!currentText ? "Please extract text first" : "Structure content blocks"}
                                >
                                    <CodeTagIcon className="w-5 h-5 mr-2" />
                                    {textAfterStep2 ? "Re-run Step 2" : "Configure Step 2"}
                                </button>
                                <button 
                                    onClick={() => handleSaveAndProceed(onConfigureValidation)} 
                                    className={`w-full flex items-center justify-center px-4 py-3 font-bold rounded-md transition-colors ${!currentText ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-indigo-700 text-white hover:bg-indigo-600'} disabled:opacity-50`} 
                                    disabled={!currentText}
                                    title={!currentText ? "Please extract text first" : "Advanced AI audit and structure repair"}
                                >
                                    <ShieldCheckIcon className="w-5 h-5 mr-2" />
                                    {textAfterStep3 ? "Re-run Step 3" : "Configure Step 3"}
                                </button>
                            </div>
                        </div>

                        <div>
                            <h3 className="text-lg font-semibold text-gray-200 mb-4">Tools</h3>
                            <div className="space-y-2">
                                <button 
                                    onClick={handleTranslateClick} 
                                    disabled={isTranslating}
                                    className="w-full flex items-center justify-center px-4 py-3 bg-purple-600 text-white font-bold rounded-md hover:bg-purple-500 transition-colors disabled:bg-purple-800 disabled:cursor-wait"
                                >
                                    <LanguageIcon className="w-5 h-5 mr-2" />
                                    {isTranslating ? 'Translating...' : (isTranslationVisible ? 'Hide Translation' : 'Translate to English')}
                                </button>
                                <p className="text-xs text-gray-500 text-center">Compare with translation to validate hierarchy.</p>
                            </div>
                        </div>
                        
                        <div className="pt-8 border-t border-gray-700">
                          <h3 className="text-lg font-semibold text-gray-200 mb-3">Download / View</h3>
                          <div className="space-y-3 p-3 bg-gray-900/50 rounded-lg">
                              <fieldset>
                                  <legend className="sr-only">Select version to download/view</legend>
                                  <div className="space-y-2 text-sm">
                                      <label className={radioLabelClasses(false)}>
                                          <input
                                              type="radio"
                                              name="download-option"
                                              value="initial"
                                              checked={activeVersion === 'initial'}
                                              onChange={() => onVersionSelect('initial')}
                                              className="w-4 h-4 text-teal-600 bg-gray-700 border-gray-600 focus:ring-teal-500"
                                          />
                                          <span>Initial Text (Extracted)</span>
                                      </label>
                                      <label className={radioLabelClasses(!textAfterStep1)} title={!textAfterStep1 ? "Run Step 1 to enable" : ""}>
                                          <input
                                              type="radio"
                                              name="download-option"
                                              value="step1"
                                              checked={activeVersion === 'step1'}
                                              onChange={() => onVersionSelect('step1')}
                                              disabled={!textAfterStep1}
                                              className="w-4 h-4 text-teal-600 bg-gray-700 border-gray-600 focus:ring-teal-500"
                                          />
                                          <span>Step 1: Headlines {!textAfterStep1 && <span className="text-xs text-gray-500 italic ml-1">(Inactive)</span>}</span>
                                      </label>
                                      <label className={radioLabelClasses(!textAfterStep1_5)} title={!textAfterStep1_5 ? "Run Step 1.5 to enable" : ""}>
                                          <input
                                              type="radio"
                                              name="download-option"
                                              value="step1_5"
                                              checked={activeVersion === 'step1_5'}
                                              onChange={() => onVersionSelect('step1_5')}
                                              disabled={!textAfterStep1_5}
                                              className="w-4 h-4 text-teal-600 bg-gray-700 border-gray-600 focus:ring-teal-500"
                                          />
                                          <span>Step 1.5: Footnotes {!textAfterStep1_5 && <span className="text-xs text-gray-500 italic ml-1">(Inactive)</span>}</span>
                                      </label>
                                      <label className={radioLabelClasses(!textAfterStep2)} title={!textAfterStep2 ? "Run Step 2 to enable" : ""}>
                                          <input
                                              type="radio"
                                              name="download-option"
                                              value="step2"
                                              checked={activeVersion === 'step2'}
                                              onChange={() => onVersionSelect('step2')}
                                              disabled={!textAfterStep2}
                                              className="w-4 h-4 text-teal-600 bg-gray-700 border-gray-600 focus:ring-teal-500"
                                          />
                                          <span>Step 2: Content {!textAfterStep2 && <span className="text-xs text-gray-500 italic ml-1">(Inactive)</span>}</span>
                                      </label>
                                      <label className={radioLabelClasses(!textAfterStep3)} title={!textAfterStep3 ? "Run Step 3 to enable" : ""}>
                                          <input
                                              type="radio"
                                              name="download-option"
                                              value="step3"
                                              checked={activeVersion === 'step3'}
                                              onChange={() => onVersionSelect('step3')}
                                              disabled={!textAfterStep3}
                                              className="w-4 h-4 text-teal-600 bg-gray-700 border-gray-600 focus:ring-teal-500"
                                          />
                                          <span>Step 3: Fixed Structure {!textAfterStep3 && <span className="text-xs text-gray-500 italic ml-1">(Inactive)</span>}</span>
                                      </label>
                                  </div>
                              </fieldset>
                              <button onClick={onDownload} className="w-full flex items-center justify-center mt-3 px-4 py-2 text-sm rounded-md transition-colors bg-green-600 hover:bg-green-500 text-white font-semibold">
                                  <DownloadIcon className="w-4 h-4 mr-2" />
                                  Download Displayed Version
                              </button>
                          </div>
                        </div>
                    </div>
                )}
                {activeSidebarTab === 'log' && (
                    <div className="p-6">
                        <h3 className="text-lg font-semibold text-gray-200 mb-4">Session Summary</h3>
                         <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700 mb-6 font-mono text-sm">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-400">Total Time:</span>
                                <span className="text-teal-300">{formatTime(totalElapsedTime)}</span>
                            </div>
                             <div className="flex justify-between items-center mt-2">
                                <span className="text-gray-400">API Calls (Flash):</span>
                                <span className="text-sky-300">{apiCallStats.flash}</span>
                            </div>
                            <div className="flex justify-between items-center mt-1">
                                <span className="text-gray-400">API Calls (Pro):</span>
                                <span className="text-sky-300">{apiCallStats.pro}</span>
                            </div>
                            <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-700/50">
                                <span className="text-gray-400 font-bold">Total API Calls:</span>
                                <span className="text-sky-300 font-bold">{apiCallStats.total}</span>
                            </div>
                        </div>
                        
                        <h3 className="text-lg font-semibold text-gray-200 mb-4">Full Log</h3>
                        <div className="w-full text-left bg-gray-900/70 p-4 rounded-lg h-96 overflow-y-auto font-mono text-xs border border-gray-700">
                            {fullSessionLog.length === 0 && <p className="text-gray-500">No activity recorded yet.</p>}
                            {fullSessionLog.map((log, index) => {
                                const isHeader = log.startsWith('---');
                                const logClass = isHeader 
                                    ? 'text-yellow-400 font-bold mt-2 pt-2 border-t border-gray-700'
                                    : 'text-gray-400';
                                const logSymbol = isHeader ? '#' : '>';
                                
                                return (
                                <p key={index} className={`animate-fade-in leading-relaxed ${logClass}`}>
                                    <span className="text-gray-600 mr-2">{logSymbol}</span>{log.replace(/---/g, '').trim()}
                                </p>
                                )
                            })}
                        </div>
                    </div>
                )}
            </div>
        </aside>
      </div>
    </div>
  );
});
