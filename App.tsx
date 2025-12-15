
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  ProcessingState, 
  ProcessingMode, 
  SelectedSteps, 
  ExtractionStats, 
  OcrPage,
  ChatEntry
} from './types';
import { 
  extractTextFromFile, 
  getPdfPageCount,
  loadPdfDocument
} from './services/pdfExtractor';
import { 
  performOcrOnPdf,
  detectDocumentLanguage, 
  transformJsonToText,
  processDocumentChunk,
  chatAboutRefinement,
  performOcrOnPageTextOnly,
  linearizeTableFromPdf,
  extractTextWithOcr,
  validateStructuralIntegrity,
  MODEL_FAST,
  MODEL_STRICT,
  guardStep3ConservativeOutput
} from './services/geminiService';
import { 
  getChunksForStep1A,
  getChunksForStep2,
  getChunksForStep3,
  createChunks,
  getChunksForCleaning,
  createChunksByCount
} from './services/chunkingService';
import { 
    getTaskInstructionsForStep1_Headlines,
    getTaskInstructionsForStep1_Footnotes,
    getTaskInstructionsForStep2_Content,
    getTaskInstructionsForStep3_BatchFix,
    getTaskInstructionsForCleaning,
    getTaskInstructionsForTranslation
} from './services/promptRegistry';

import { FileUpload } from './components/FileUpload';
import { ProcessingIndicator } from './components/ProcessingIndicator';
import { ConfigurationScreen } from './components/ConfigurationScreen';
import { ResultViewer, DownloadVersion, ResultViewerRef } from './components/ResultViewer';
import { OcrReviewer } from './components/OcrReviewer';
import { JsonReviewer } from './components/JsonReviewer';
import { CorrectionsReviewer } from './components/CorrectionsReviewer';
import { ReviewChangesModal } from './components/ReviewChangesModal'; 
import { DevToolsScreen } from './components/DevToolsScreen';
import { PerformanceTracker } from './components/PerformanceTracker';
import { usePerformanceTracker } from './hooks/usePerformanceTracker';
import { SUPPORTED_LANGUAGES } from './constants';
import { CogIcon, SparklesIcon, ArrowRightIcon } from './components/icons';

// OPTIMIZATION: Updated defaults to match chunkingService.ts
const BASE_CHUNK_SIZE_QUALITY = 80000; // Matches Cleaning Limit (Aggressive)
const BASE_CHUNK_SIZE_FAST = 28000;    // Matches Step 1/2 Limit
const OVERLAP_CONTEXT_SIZE = 400; 
const PAGE_BREAK_MARKER = '\n\n--- PAGE BREAK ---\n\n';

// --- INLINE COMPONENTS RESTORED ---

interface TitleInputModalProps {
  isOpen: boolean;
  initialText: string;
  onConfirm: (title: string) => void;
  onCancel: () => void;
}

const TitleInputModal: React.FC<TitleInputModalProps> = ({ isOpen, initialText = "", onConfirm, onCancel }) => {
    // IMPORTANT: hooks must be unconditional (avoid "Rendered fewer hooks than expected")
    const [title, setTitle] = useState('');

    if (!isOpen) return null;

    const suggestions = useMemo(() => {
        if (!initialText) return [];
        // Get first 6 non-empty lines to analyze
        const lines = initialText.split('\n')
            .map(l => l.trim())
            .filter(line => line.length > 0)
            .slice(0, 6);

        if (lines.length === 0) return [];

        const candidates: string[] = [];

        // Strategy 1: Combined First + Second line (Most common for PDF titles: "Chapter X \n Title Name")
        if (lines.length > 1) {
            candidates.push(`${lines[0]} ${lines[1]}`);
        }

        // Strategy 2: First line only
        candidates.push(lines[0]);

        // Strategy 3: Combined First + Second + Third (For very long titles)
        if (lines.length > 2) {
            candidates.push(`${lines[0]} ${lines[1]} ${lines[2]}`);
        }

        // Strategy 4: Second line only (if first line is garbage like page number)
        if (lines.length > 1) {
            candidates.push(lines[1]);
        }

        // Filter duplicates and ensure length is reasonable
        const uniqueCandidates = Array.from(new Set(candidates));
        return uniqueCandidates.filter(s => s.length > 2 && s.length < 200).slice(0, 5);
    }, [initialText]);

    useEffect(() => {
        // Auto-select the first suggestion (which is now the combined one if available)
        if (suggestions.length > 0) {
             setTitle(suggestions[0]); 
        }
    }, [suggestions]);

    return (
        <div className="fixed inset-0 bg-gray-900/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fade-in">
            <div className="w-full max-w-3xl bg-gray-800 rounded-xl shadow-2xl flex flex-col border border-gray-700">
                <header className="p-6 border-b border-gray-700">
                    <h2 className="text-2xl font-bold text-white">Set Main Title (level0)</h2>
                    <p className="text-gray-400 mt-1">What is the main title? The app will add <code>{"{{level0}}"}</code> tags.</p>
                </header>
                <main className="p-6 space-y-6">
                    <textarea
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        rows={3}
                        className="w-full p-4 bg-gray-900 text-gray-300 font-mono text-sm border border-gray-600 rounded-md focus:ring-2 focus:ring-teal-500"
                        placeholder="Type the document title here..."
                    />
                    {suggestions.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-gray-300 mb-2">Smart Suggestions:</h3>
                            <div className="space-y-2">
                                {suggestions.map((suggestion, index) => (
                                    <button 
                                        key={index} 
                                        onClick={() => setTitle(suggestion)} 
                                        className="block w-full text-left p-3 bg-gray-700 hover:bg-teal-900/30 hover:border-teal-500 border border-transparent rounded text-sm text-gray-200 transition-colors truncate"
                                    >
                                        {suggestion}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </main>
                <footer className="p-6 border-t border-gray-700 flex justify-end items-center space-x-4">
                    <button onClick={onCancel} className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-500">Skip Title</button>
                    <button onClick={() => onConfirm(title)} className="px-6 py-2 bg-teal-600 text-white font-bold rounded hover:bg-teal-500 shadow-lg shadow-teal-900/20">Confirm Title</button>
                </footer>
            </div>
        </div>
    );
};

interface ComparisonFilePromptProps {
  onFileProvided: (file: File) => void;
  onClean: () => void;
  onLoadDirectly: () => void;
}

const ComparisonFilePrompt: React.FC<ComparisonFilePromptProps> = ({ onFileProvided, onClean, onLoadDirectly }) => {
  return (
    <div className="flex flex-col items-center space-y-6 animate-fade-in w-full max-w-4xl">
      <div className="w-full p-8 bg-gray-800 rounded-xl shadow-lg border border-gray-700">
        <h2 className="text-2xl font-bold text-teal-300 text-center mb-6">Processing Options for .TXT</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
             <div className="p-4 bg-gray-700/30 rounded-lg border border-gray-600 flex flex-col">
                <h3 className="font-bold text-lg text-white mb-1">1. Attach Reference PDF</h3>
                <p className="text-xs text-gray-400 mb-4">Upload original PDF for Step 3 audit.</p>
                <FileUpload onFileSelect={onFileProvided} disabled={false} acceptedFileTypes="application/pdf" descriptionText="Drop Reference PDF" />
             </div>
             <div className="p-4 bg-gray-700/30 rounded-lg border border-gray-600 flex flex-col items-center justify-center">
                <button onClick={onClean} className="w-full py-6 bg-indigo-600/80 hover:bg-indigo-500 text-white font-bold rounded-lg flex flex-col items-center justify-center">
                    <SparklesIcon className="w-8 h-8 mb-2 opacity-80" />
                    <span>Run Smart Clean</span>
                </button>
             </div>
             <div className="p-4 bg-gray-700/30 rounded-lg border border-gray-600 flex flex-col items-center justify-center">
                <button onClick={onLoadDirectly} className="w-full py-6 bg-teal-600/80 hover:bg-teal-500 text-white font-bold rounded-lg flex flex-col items-center justify-center">
                    <ArrowRightIcon className="w-8 h-8 mb-2 opacity-80" />
                    <span>Load Directly</span>
                </button>
             </div>
        </div>
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [processingState, setProcessingState] = useState<ProcessingState>(ProcessingState.IDLE);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>(ProcessingMode.QUALITY);

  // Text States
  const [currentText, setCurrentText] = useState<string>("");
  const [textBeforeStep3, setTextBeforeStep3] = useState<string>("");
  const [referenceText, setReferenceText] = useState<string>(""); 
  const [initialExtractedText, setInitialExtractedText] = useState<string>("");
  const [txtFileContent, setTxtFileContent] = useState<string>("");

  // Checkpoint Texts
  const [textAfterStep1, setTextAfterStep1] = useState<string | null>(null);
  const [textAfterStep1_5, setTextAfterStep1_5] = useState<string | null>(null);
  const [textAfterStep2, setTextAfterStep2] = useState<string | null>(null);
  const [textAfterStep3, setTextAfterStep3] = useState<string | null>(null);

  // Undo/Redo & History
  const [textHistory, setTextHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  // Pending Changes (For Review Modal)
  const [pendingChanges, setPendingChanges] = useState<{
      oldText: string;
      newText: string;
      stepTitle: string;
      onAccept: () => void;
  } | null>(null);

  // Config
  const [documentLanguage, setDocumentLanguage] = useState<string>("English");
  const [isDetectingLanguage, setIsDetectingLanguage] = useState<boolean>(false);
  const [chunkSize, setChunkSize] = useState<number>(1);
  const [selectedSteps, setSelectedSteps] = useState<SelectedSteps>({ step1: true, step1_5: true, step2: true, step3: true });

  // UI State
  const [progress, setProgress] = useState<number>(0);
  const [currentActivity, setCurrentActivity] = useState<string>("");
  const [activityLog, setActivityLog] = useState<string[]>([]);
  const [failedChunks, setFailedChunks] = useState<number[]>([]);
  const [activeVersion, setActiveVersion] = useState<DownloadVersion>('initial');
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [showDevTools, setShowDevTools] = useState<boolean>(false);
  const [isReviewingLast, setIsReviewingLast] = useState<boolean>(false);

  // Modals State
  const [titleInputState, setTitleInputState] = useState<{initialText: string, onConfirm: (t:string)=>void, onCancel: ()=>void} | null>(null);

  // Special Reviewers
  const [ocrPages, setOcrPages] = useState<OcrPage[]>([]);
  const [jsonContent, setJsonContent] = useState<string>("");

  // Translation
  const [isTranslating, setIsTranslating] = useState<boolean>(false);
  const [translatedText, setTranslatedText] = useState<string>("");

  // Stats
  const { elapsedTime, apiCalls, isRunning, startTimer, stopTimer, resetTimer, incrementApiCalls } = usePerformanceTracker();
  const [extractionStats, setExtractionStats] = useState<ExtractionStats | null>(null);
  const shouldStopRef = useRef(false);

  const resultViewerRef = useRef<ResultViewerRef>(null);
  const tableFileInputRef = useRef<HTMLInputElement>(null);

  const addToLog = (msg: string) => setActivityLog(prev => [...prev, msg]);

  // --- AUTOMATIC CHUNK CALCULATION ---
  useEffect(() => {
    if (!currentText) return;

    let targetSize = BASE_CHUNK_SIZE_FAST;
    if (processingState === ProcessingState.CONFIGURING_CLEANING) {
        targetSize = BASE_CHUNK_SIZE_QUALITY;
    } else if (processingState === ProcessingState.CONFIGURING_HEADLINES || processingState === ProcessingState.CONFIGURING_CONTENT) {
        targetSize = BASE_CHUNK_SIZE_FAST;
    } else {
        return;
    }

    const idealChunks = Math.max(1, Math.ceil(currentText.length / targetSize));
    setChunkSize(idealChunks);

  }, [processingState, currentText]);

  // --- HISTORY MANAGEMENT ---
  const updateText = useCallback((newText: string, recordHistory = true) => {
      setCurrentText(newText);
      if (recordHistory) {
          setTextHistory(prev => {
              const currentHistory = prev.slice(0, historyIndex + 1);
              if (currentHistory.length > 0 && currentHistory[currentHistory.length - 1] === newText) return prev;
              return [...currentHistory, newText];
          });
          setHistoryIndex(prev => prev + 1);
      }
      if (newText.includes('{{level1}}') && !textAfterStep1) setTextAfterStep1(newText);
      if (newText.includes('{{footnotenumber') && !textAfterStep1_5) setTextAfterStep1_5(newText);
      if (newText.includes('{{text_level}}') && !textAfterStep2) setTextAfterStep2(newText);
  }, [historyIndex, textAfterStep1, textAfterStep1_5, textAfterStep2]);

  useEffect(() => {
    if (initialExtractedText && textHistory.length === 0) {
        setTextHistory([initialExtractedText]);
        setHistoryIndex(0);
    }
  }, [initialExtractedText, textHistory.length]);

  const undo = () => {
      if (historyIndex > 0) {
          const newIndex = historyIndex - 1;
          setHistoryIndex(newIndex);
          setCurrentText(textHistory[newIndex]);
      }
  };

  const redo = () => {
      if (historyIndex < textHistory.length - 1) {
          const newIndex = historyIndex + 1;
          setHistoryIndex(newIndex);
          setCurrentText(textHistory[newIndex]);
      }
  };

  const handleStopProcessing = () => {
      shouldStopRef.current = true;
      stopTimer();
      setProcessingState(ProcessingState.SUCCESS);
  };

  const handleReset = () => {
      setFile(null);
      setProcessingState(ProcessingState.IDLE);
      setCurrentText("");
      setInitialExtractedText("");
      setTextHistory([]);
      setHistoryIndex(-1);
      setTextAfterStep1(null);
      setTextAfterStep1_5(null);
      setTextAfterStep2(null);
      setTextAfterStep3(null);
      setReferenceText("");
      resetTimer();
  };

  const handleFileSelect = async (selectedFile: File) => {
      handleReset();
      setFile(selectedFile);
      setActivityLog([]);
      setExtractionStats(null);
      startTimer();
      shouldStopRef.current = false;

      if (selectedFile.type === 'application/json' || selectedFile.name.endsWith('.json')) {
          const text = await selectedFile.text();
          setJsonContent(text);
          setProcessingState(ProcessingState.REVIEWING_JSON);
          stopTimer();
          return;
      }

      if (selectedFile.type === 'text/plain' || selectedFile.name.endsWith('.txt')) {
           const text = await selectedFile.text();
           setTxtFileContent(text);
           setProcessingState(ProcessingState.AWAITING_TXT_ACTION);
           stopTimer();
           return;
      }

      setProcessingState(ProcessingState.EXTRACTING);
      try {
          const pageCount = await getPdfPageCount(selectedFile);
          const text = await extractTextFromFile(selectedFile, setProgress);

          if (text.includes("requires an OCR process")) {
               setProcessingState(ProcessingState.OCR);
               const ocrResults = await performOcrOnPdf(
                   selectedFile, 
                   incrementApiCalls, 
                   ProcessingMode.FAST, 
                   documentLanguage, 
                   setProgress, 
                   (msg) => addToLog(msg)
                );
               setOcrPages(ocrResults);
               setProcessingState(ProcessingState.REVIEWING_OCR);
               setExtractionStats({
                   method: 'OCR (All Pages)',
                   totalPages: pageCount,
                   textPages: 0,
                   imagePages: pageCount,
                   averageCharsPerPage: ocrResults.reduce((acc, p) => acc + p.ocrText.length, 0) / pageCount
               });
          } else {
              setInitialExtractedText(text);
              setCurrentText(text);
              updateText(text);
              setReferenceText(text); 
              setProcessingState(ProcessingState.CONFIGURING_CLEANING);
              setExtractionStats({
                   method: 'Native Text',
                   totalPages: pageCount,
                   textPages: pageCount,
                   imagePages: 0,
                   averageCharsPerPage: text.length / pageCount
               });
          }
      } catch (e) {
          console.error(e);
          setProcessingState(ProcessingState.ERROR);
      }
      stopTimer();
  };

  const handleStartCleaning = async () => {
    setProcessingState(ProcessingState.CLEANING);
    setCurrentActivity('Running Smart AI Cleaning...');
    setActivityLog([]);
    setProgress(0);
    startTimer();
    shouldStopRef.current = false;

    const chunks = createChunksByCount(currentText, chunkSize);
    const totalChunks = chunks.length;
    const cleanedChunks: string[] = [];
    addToLog(`> Split into ${totalChunks} chunks.`);

    for (let i = 0; i < totalChunks; i++) {
        if (shouldStopRef.current) break;
        setCurrentActivity(`Cleaning chunk ${i + 1} of ${totalChunks}...`);

        try {
            const cleanedText = await processDocumentChunk({
                main_chunk_content: chunks[i],
                continuous_context_summary: cleanedChunks.length > 0 ? cleanedChunks[cleanedChunks.length - 1].slice(-1000) : '',
                previous_chunk_overlap: i > 0 ? chunks[i - 1].slice(-OVERLAP_CONTEXT_SIZE) : '',
                next_chunk_overlap: i < totalChunks - 1 ? chunks[i + 1].slice(0, OVERLAP_CONTEXT_SIZE) : '',
                task_instructions: getTaskInstructionsForCleaning(documentLanguage),
                onApiCall: incrementApiCalls,
                mode: ProcessingMode.QUALITY,
                language: documentLanguage,
                model: MODEL_STRICT
            });
            cleanedChunks.push(cleanedText.startsWith('[ERROR') ? chunks[i] : cleanedText);
        } catch (e) {
            cleanedChunks.push(chunks[i]);
        }
        setProgress(Math.round(((i + 1) / totalChunks) * 100));
    }

    if (shouldStopRef.current) { handleStopProcessing(); return; }

    const finalCleanedText = cleanedChunks.join('\n\n');
    stopTimer();

    setPendingChanges({
        oldText: currentText,
        newText: finalCleanedText,
        stepTitle: 'Smart Cleaning & Layout Fix',
        onAccept: () => {
             setTitleInputState({
                initialText: finalCleanedText,
                onConfirm: (title) => {
                     const cleanTitle = title.trim();
                     let textWithTitle = finalCleanedText;
                     if (cleanTitle) {
                         const escaped = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                         const flexiblePattern = escaped.replace(/\s+/g, '[\\s\\n\\r]+');
                         const reg = new RegExp(flexiblePattern, 'i');
                         const match = reg.exec(finalCleanedText);

                         if (match && match.index !== undefined && match.index < 500) {
                             textWithTitle = finalCleanedText.replace(reg, `{{level0}}$&{{-level0}}`);
                         } else {
                             textWithTitle = `{{level0}}${cleanTitle}{{-level0}}\n\n${finalCleanedText}`;
                         }
                     }
                     setInitialExtractedText(textWithTitle);
                     updateText(textWithTitle);
                     setPendingChanges(null);
                     setTitleInputState(null);
                     setProcessingState(ProcessingState.SUCCESS);
                },
                onCancel: () => {
                     setInitialExtractedText(finalCleanedText);
                     updateText(finalCleanedText);
                     setPendingChanges(null);
                     setTitleInputState(null);
                     setProcessingState(ProcessingState.SUCCESS);
                }
             });
        }
    });
    setProcessingState(ProcessingState.REVIEWING_CHANGES);
  };

  const handleStartStep1 = async () => {
      setProcessingState(ProcessingState.STRUCTURING_HEADLINES);
      setCurrentActivity('Step 1: Tagging Headlines...');
      setActivityLog([]); setProgress(0); startTimer(); shouldStopRef.current = false;

      const chunks = createChunksByCount(currentText, chunkSize);
      let processedText = "";
      addToLog(`> Split into ${chunks.length} chunks.`);

      for(let i=0; i<chunks.length; i++) {
           if (shouldStopRef.current) break;
           setProgress(Math.round(((i+1)/chunks.length)*100));
           const result = await processDocumentChunk({
               main_chunk_content: chunks[i],
               continuous_context_summary: "", previous_chunk_overlap: "", next_chunk_overlap: "",
               task_instructions: getTaskInstructionsForStep1_Headlines(documentLanguage),
               onApiCall: incrementApiCalls, mode: ProcessingMode.FAST, language: documentLanguage,
               model: MODEL_FAST
           });
           processedText += result + "\n\n";
      }

      if (shouldStopRef.current) { handleStopProcessing(); return; }

      const finalText = processedText.trim();
      stopTimer();
      setPendingChanges({
          oldText: currentText, newText: finalText, stepTitle: "Step 1: Headlines",
          onAccept: () => { setTextAfterStep1(finalText); updateText(finalText); setPendingChanges(null); setProcessingState(ProcessingState.SUCCESS); }
      });
      setProcessingState(ProcessingState.REVIEWING_CHANGES);
  };

  const handleStartStep1_5 = async () => {
      setProcessingState(ProcessingState.STRUCTURING_FOOTNOTES);
      setCurrentActivity('Step 1.5: Tagging Footnotes...');
      setActivityLog([]); setProgress(0); startTimer();

      const chunks = createChunks(currentText, 15000);
      let processedText = "";

      for(let i=0; i<chunks.length; i++) {
           setProgress(Math.round(((i+1)/chunks.length)*100));
           const result = await processDocumentChunk({
               main_chunk_content: chunks[i],
               continuous_context_summary: "", previous_chunk_overlap: "", next_chunk_overlap: "",
               task_instructions: getTaskInstructionsForStep1_Footnotes(documentLanguage),
               onApiCall: incrementApiCalls, mode: ProcessingMode.FAST, language: documentLanguage,
               model: MODEL_FAST
           });
           processedText += result + "\n\n";
      }
      const finalText = processedText.trim();
      stopTimer();
      setPendingChanges({
          oldText: currentText, newText: finalText, stepTitle: "Step 1.5: Footnotes",
          onAccept: () => { setTextAfterStep1_5(finalText); updateText(finalText); setPendingChanges(null); setProcessingState(ProcessingState.SUCCESS); }
      });
      setProcessingState(ProcessingState.REVIEWING_CHANGES);
  };

  const handleStartStep2 = async () => {
      setProcessingState(ProcessingState.STRUCTURING_CONTENT);
      setCurrentActivity('Step 2: Structuring Content...');
      setActivityLog([]); setProgress(0); startTimer();

      const chunks = createChunksByCount(currentText, chunkSize);
      let processedText = "";
      addToLog(`> Split into ${chunks.length} chunks.`);

      for(let i=0; i<chunks.length; i++) {
           setProgress(Math.round(((i+1)/chunks.length)*100));
           const result = await processDocumentChunk({
               main_chunk_content: chunks[i],
               continuous_context_summary: "", previous_chunk_overlap: "", next_chunk_overlap: "",
               task_instructions: getTaskInstructionsForStep2_Content(documentLanguage),
               onApiCall: incrementApiCalls, mode: ProcessingMode.FAST, language: documentLanguage,
               model: MODEL_FAST
           });
           processedText += result + "\n\n";
      }
      const rawText = processedText.trim();
      const finalText = validateStructuralIntegrity(rawText);

      stopTimer();
      setPendingChanges({
          oldText: currentText, newText: finalText, stepTitle: "Step 2: Content",
          onAccept: () => { setTextAfterStep2(finalText); updateText(finalText); setPendingChanges(null); setProcessingState(ProcessingState.SUCCESS); }
      });
      setProcessingState(ProcessingState.REVIEWING_CHANGES);
  };

  const handleStartStep3 = async () => {
      setTextBeforeStep3(currentText);
      setProcessingState(ProcessingState.AUDITING_STRUCTURE);
      setCurrentActivity('Step 3: Auditing Structure...');
      setActivityLog([]); setProgress(0); startTimer();

      const chunks = getChunksForStep3(currentText);
      let processedText = "";

      for(let i=0; i<chunks.length; i++) {
           setProgress(Math.round(((i+1)/chunks.length)*100));
           const result = await processDocumentChunk({
               main_chunk_content: chunks[i],
               continuous_context_summary: "", previous_chunk_overlap: "", next_chunk_overlap: "",
               task_instructions: getTaskInstructionsForStep3_BatchFix(documentLanguage, referenceText.slice(0, 5000)),
               onApiCall: incrementApiCalls, mode: ProcessingMode.QUALITY, language: documentLanguage,
               model: MODEL_STRICT
           });
           processedText += result + "\n\n";
      }
      const finalText = processedText.trim();
      stopTimer();

      const guarded = guardStep3ConservativeOutput(currentText, finalText);
      if (guarded.issues.length > 0) {
          addToLog(`> Step 3 output rejected by guardrails: ${guarded.issues.join(' | ')}`);
          updateText(currentText, false);
          setProcessingState(ProcessingState.REVIEWING_STEP3_FINAL);
          return;
      }

      updateText(guarded.text, false);
      setProcessingState(ProcessingState.REVIEWING_STEP3_FINAL);
  };

  const handleOcrConfirm = (texts: string[]) => {
      const fullText = texts.join('\n\n--- PAGE BREAK ---\n\n');
      setInitialExtractedText(fullText);
      setCurrentText(fullText);
      updateText(fullText);
      setReferenceText(fullText);
      setProcessingState(ProcessingState.CONFIGURING_CLEANING);
  };

  const handleJsonConfirm = async (json: string) => {
      setProcessingState(ProcessingState.TRANSFORMING_JSON);
      startTimer();
      const text = await transformJsonToText(json, incrementApiCalls);
      setInitialExtractedText(text);
      updateText(text);
      setProcessingState(ProcessingState.SUCCESS);
      stopTimer();
  };

  const handleComparisonFileSelect = async (file: File) => {
    setProcessingState(ProcessingState.EXTRACTING);
    try {
        let extracted = "";
        if (file.type === 'application/pdf') {
            extracted = await extractTextWithOcr(file, incrementApiCalls, ProcessingMode.FAST, documentLanguage, setProgress);
        } else {
             extracted = await file.text();
        }
        setReferenceText(extracted);
        setInitialExtractedText(txtFileContent);
        setCurrentText(txtFileContent);
        updateText(txtFileContent);
        setProcessingState(ProcessingState.SUCCESS);
    } catch (e: any) {
        console.error(e);
        setProcessingState(ProcessingState.ERROR);
    }
  };

  const handleTableLinearization = async (file: File) => {
    setProcessingState(ProcessingState.TABLE_LINEARIZING);
    try {
        startTimer();
        const result = await linearizeTableFromPdf(file, incrementApiCalls, (p) => { setCurrentActivity(p.stage); setProgress(p.percentage); });
        setCurrentText(result);
        setInitialExtractedText(result);
        updateText(result);
        setProcessingState(ProcessingState.SUCCESS);
    } catch (e: any) {
        setProcessingState(ProcessingState.ERROR);
    } finally { stopTimer(); }
  };

  const onRunSequence = async () => {
      if (selectedSteps.step1 && !textAfterStep1) await handleStartStep1();
      else if (selectedSteps.step1_5 && !textAfterStep1_5) await handleStartStep1_5();
      else if (selectedSteps.step2 && !textAfterStep2) await handleStartStep2();
      else if (selectedSteps.step3 && !textAfterStep3) await handleStartStep3();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 font-sans flex flex-col items-center py-8">
      <button 
          onClick={() => setShowDevTools(true)}
          className="fixed top-4 right-4 p-2 text-gray-500 hover:text-white transition-colors z-50"
      >
          <CogIcon className="w-6 h-6" />
      </button>

      {showDevTools && <DevToolsScreen onClose={() => setShowDevTools(false)} supportedLanguages={SUPPORTED_LANGUAGES} />}

      <PerformanceTracker elapsedTime={elapsedTime} apiCalls={apiCalls} isVisible={isRunning || apiCalls.total > 0} />

      {titleInputState && (
          <TitleInputModal 
            isOpen={true} 
            initialText={titleInputState.initialText} 
            onConfirm={titleInputState.onConfirm} 
            onCancel={titleInputState.onCancel} 
          />
      )}

      {processingState === ProcessingState.IDLE && (
          <div className="flex flex-col items-center justify-center h-[80vh] space-y-6">
              <h1 className="text-4xl font-bold mb-4 text-teal-400">PDF OCR 4.5 Pro</h1>
              <div className="bg-gray-800 p-8 rounded-xl border border-gray-700 w-full max-w-4xl grid grid-cols-2 gap-8">
                  <div className="space-y-4">
                      <h3 className="text-xl font-semibold">Settings</h3>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Language</label>
                        <select value={documentLanguage} onChange={e=>setDocumentLanguage(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm">
                            {SUPPORTED_LANGUAGES.map(l => <option key={l.name} value={l.name}>{l.name}</option>)}
                        </select>
                      </div>
                       <div>
                        <label className="block text-sm text-gray-400 mb-1">Processing Mode</label>
                        <div className="flex bg-gray-700 rounded p-1">
                             <button onClick={()=>setProcessingMode(ProcessingMode.FAST)} className={`flex-1 py-1 rounded text-sm ${processingMode===ProcessingMode.FAST ? 'bg-teal-600':'text-gray-400'}`}>Speed (Flash)</button>
                             <button onClick={()=>setProcessingMode(ProcessingMode.QUALITY)} className={`flex-1 py-1 rounded text-sm ${processingMode===ProcessingMode.QUALITY ? 'bg-indigo-600':'text-gray-400'}`}>Quality (Pro)</button>
                        </div>
                      </div>
                  </div>
                  <div className="border-l border-gray-700 pl-8 flex flex-col justify-center">
                      <FileUpload onFileSelect={handleFileSelect} disabled={false} />
                      <div className="mt-4 pt-4 border-t border-gray-700/50">
                        <label className="flex items-center space-x-2 text-gray-400 text-xs cursor-pointer hover:text-white transition-colors">
                            <input type="file" ref={tableFileInputRef} className="hidden" accept="application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleTableLinearization(file); }} />
                            <span className="p-2 bg-gray-700 rounded hover:bg-gray-600">📂 Specialized Table Processor (Beta)</span>
                        </label>
                     </div>
                  </div>
              </div>
          </div>
      )}

      {processingState === ProcessingState.AWAITING_TXT_ACTION && (
          <ComparisonFilePrompt 
              onFileProvided={handleComparisonFileSelect}
              onClean={() => {
                  setInitialExtractedText(txtFileContent);
                  setCurrentText(txtFileContent);
                  updateText(txtFileContent);
                  setProcessingState(ProcessingState.CONFIGURING_CLEANING);
              }}
              onLoadDirectly={() => {
                  setInitialExtractedText(txtFileContent);
                  setCurrentText(txtFileContent);
                  updateText(txtFileContent);
                  setProcessingState(ProcessingState.SUCCESS);
              }}
          />
      )}

      {(processingState === ProcessingState.EXTRACTING || 
        processingState === ProcessingState.OCR || 
        processingState === ProcessingState.TRANSFORMING_JSON ||
        processingState === ProcessingState.CLEANING ||
        processingState === ProcessingState.STRUCTURING_HEADLINES ||
        processingState === ProcessingState.STRUCTURING_FOOTNOTES ||
        processingState === ProcessingState.STRUCTURING_CONTENT ||
        processingState === ProcessingState.AUDITING_STRUCTURE ||
        processingState === ProcessingState.TABLE_LINEARIZING) && (
          <ProcessingIndicator 
              progress={progress} 
              state={processingState} 
              currentActivity={currentActivity}
              activityLog={activityLog}
              title={processingState.replace(/_/g, " ")}
              onStop={handleStopProcessing}
          />
      )}

      {processingState === ProcessingState.REVIEWING_OCR && (
          <OcrReviewer pages={ocrPages} onConfirm={handleOcrConfirm} onCancel={handleReset} />
      )}

      {processingState === ProcessingState.REVIEWING_JSON && (
          <JsonReviewer initialJson={jsonContent} onConfirm={handleJsonConfirm} onCancel={handleReset} />
      )}

      {processingState === ProcessingState.REVIEWING_CHANGES && pendingChanges && (
          <ReviewChangesModal 
              isOpen={true}
              title={`Review: ${pendingChanges.stepTitle}`}
              oldText={pendingChanges.oldText}
              newText={pendingChanges.newText}
              onAccept={pendingChanges.onAccept}
              onReject={() => {
                  setPendingChanges(null);
                  if (isReviewingLast) { setIsReviewingLast(false); setProcessingState(ProcessingState.SUCCESS); }
                  else setProcessingState(ProcessingState.SUCCESS);
              }}
              isReviewOnly={isReviewingLast}
          />
      )}

      {processingState === ProcessingState.REVIEWING_STEP3_FINAL && (
          <CorrectionsReviewer 
              originalText={textBeforeStep3}
              correctedText={currentText}
              hasReference={!!referenceText}
              onConfirm={(finalText) => {
                  setTextAfterStep3(finalText);
                  updateText(finalText, true);
                  setProcessingState(ProcessingState.SUCCESS);
              }}
              onCancel={() => {
                  setCurrentText(textBeforeStep3);
                  setProcessingState(ProcessingState.SUCCESS);
              }}
              onChatRefine={(text, instr) => chatAboutRefinement(text, instr, referenceText, documentLanguage, incrementApiCalls)}
          />
      )}

      {(processingState === ProcessingState.CONFIGURING_CLEANING || 
        processingState === ProcessingState.CONFIGURING_HEADLINES || 
        processingState === ProcessingState.CONFIGURING_CONTENT) && (
          <ConfigurationScreen 
              value={chunkSize}
              onValueChange={setChunkSize}
              onConfirm={
                  processingState === ProcessingState.CONFIGURING_CLEANING ? handleStartCleaning :
                  processingState === ProcessingState.CONFIGURING_HEADLINES ? handleStartStep1 :
                  handleStartStep2
              }
              onCancel={() => setProcessingState(ProcessingState.SUCCESS)}
              max={Math.max(50, Math.ceil(currentText.length / 500))}
              processingState={processingState}
              documentLanguage={documentLanguage}
              onDocumentLanguageChange={setDocumentLanguage}
              supportedLanguages={SUPPORTED_LANGUAGES}
              isDetectingLanguage={isDetectingLanguage}
              onDetectLanguage={async () => {
                  setIsDetectingLanguage(true);
                  const lang = await detectDocumentLanguage(currentText.slice(0,2000), SUPPORTED_LANGUAGES.map(l=>l.name), incrementApiCalls);
                  if(lang) setDocumentLanguage(lang);
                  setIsDetectingLanguage(false);
              }}
          />
      )}

      {processingState === ProcessingState.SUCCESS && (
          <ResultViewer 
              ref={resultViewerRef}
              fileName={file?.name || "Document"}
              currentText={currentText}
              onTextChange={(val) => updateText(val, true)}
              onDownload={() => {
                  const blob = new Blob([currentText], {type: 'text/plain'});
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${file?.name || 'doc'}_processed.txt`;
                  a.click();
              }}
              activeVersion={activeVersion}
              onVersionSelect={setActiveVersion}
              textAfterStep1={textAfterStep1}
              textAfterStep1_5={textAfterStep1_5}
              textAfterStep2={textAfterStep2}
              textAfterStep3={textAfterStep3}
              onConfigureHeadlines={() => setProcessingState(ProcessingState.CONFIGURING_HEADLINES)}
              onStartFootnotes={() => handleStartStep1_5()}
              onConfigureContent={() => setProcessingState(ProcessingState.CONFIGURING_CONTENT)}
              onConfigureValidation={() => handleStartStep3()}
              onUndo={undo}
              onRedo={redo}
              canUndo={historyIndex > 0}
              canRedo={historyIndex < textHistory.length - 1}
              onReviewLastChange={() => {
                   if (historyIndex > 0) {
                       setPendingChanges({
                           oldText: textHistory[historyIndex-1],
                           newText: currentText,
                           stepTitle: "Last Change",
                           onAccept: () => { setPendingChanges(null); setIsReviewingLast(false); }
                       });
                       setIsReviewingLast(true);
                       setProcessingState(ProcessingState.REVIEWING_CHANGES);
                   }
              }}
              onReset={handleReset}
              failedChunks={failedChunks}
              isEditMode={isEditMode}
              onToggleEditMode={() => setIsEditMode(!isEditMode)}
              onGoToLine={(line) => resultViewerRef.current?.goToLine(line)}
              onTranslate={async () => {
                  setIsTranslating(true);
                  const chunks = createChunks(currentText, 20000);
                  setIsTranslating(false);
              }}
              isTranslating={isTranslating}
              translatedText={translatedText}
              documentLanguage={documentLanguage}
              selectedSteps={selectedSteps}
              onSetSelectedSteps={setSelectedSteps}
              onRunSequence={onRunSequence}
              fullSessionLog={activityLog}
              totalElapsedTime={elapsedTime}
              apiCallStats={apiCalls}
              extractionStats={extractionStats}
          />
      )}
    </div>
  );
};
