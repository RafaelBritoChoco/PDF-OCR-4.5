
import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheckIcon, DocumentMagnifyingGlassIcon, SparklesIcon, ArrowRightIcon, ArrowLeftIcon, ChatBubbleLeftRightIcon, QueueListIcon, WordWrapIcon, UndoIcon, RedoIcon, PaperClipIcon, LightningIcon, BrainIcon } from './icons';
import { StructuredTextViewer, ViewerLineData } from './StructuredTextViewer';
import { generateDiff } from '../services/diffService';
import { ChatEntry } from '../types';

interface CorrectionsReviewerProps {
  originalText: string;   // Text BEFORE Step 3
  correctedText: string;  // Text AFTER Step 3 (Initial Result)
  onConfirm: (finalText: string) => void;
  onCancel: () => void;
  hasReference: boolean; // Does the user have a Reference PDF loaded?
  onChatRefine: (currentText: string, instruction: string, useProModel: boolean, imageBase64?: string) => Promise<{ reply: string, refinedText?: string }>;
}

// Utility to synchronize lines for side-by-side view
const computeSyncedRows = (oldText: string, newText: string) => {
    const diff = generateDiff(oldText, newText);
    const leftLines: ViewerLineData[] = [];
    const rightLines: ViewerLineData[] = [];
    const changeIndices: number[] = []; // Indices in the RIGHT panel where changes occurred

    let removeBuffer: string[] = [];
    let addBuffer: string[] = [];

    const flushBuffers = () => {
        const maxLen = Math.max(removeBuffer.length, addBuffer.length);
        for (let i = 0; i < maxLen; i++) {
            // Left Side
            if (i < removeBuffer.length) {
                leftLines.push({ text: removeBuffer[i], status: 'removed' });
            } else {
                leftLines.push({ text: '', status: 'empty' });
            }

            // Right Side
            if (i < addBuffer.length) {
                rightLines.push({ text: addBuffer[i], status: 'added' });
                // Mark this row as a change (on the right side)
                changeIndices.push(rightLines.length - 1);
            } else {
                rightLines.push({ text: '', status: 'empty' });
            }
        }
        removeBuffer = [];
        addBuffer = [];
    };

    for (const item of diff) {
        if (item.type === 'common') {
            flushBuffers();
            leftLines.push({ text: item.line, status: 'normal' });
            rightLines.push({ text: item.line, status: 'normal' });
        } else if (item.type === 'removed') {
            removeBuffer.push(item.line);
        } else if (item.type === 'added') {
            addBuffer.push(item.line);
        }
    }
    flushBuffers(); // Flush any remaining at the end
    
    return { leftLines, rightLines, changeIndices };
};

export const CorrectionsReviewer: React.FC<CorrectionsReviewerProps> = ({ 
    originalText, 
    correctedText, 
    onConfirm, 
    onCancel, 
    hasReference,
    onChatRefine
}) => {
    // Current Text State
    const [currentResult, setCurrentResult] = useState<string>(correctedText);
    
    // History State for Undo/Redo
    const [textHistory, setTextHistory] = useState<string[]>([correctedText]);
    const [historyIndex, setHistoryIndex] = useState<number>(0);
    
    // View State
    const [leftData, setLeftData] = useState<ViewerLineData[]>([]);
    const [rightData, setRightData] = useState<ViewerLineData[]>([]);
    const [changeIndices, setChangeIndices] = useState<number[]>([]);
    const [currentChangeIdx, setCurrentChangeIdx] = useState<number>(-1);
    const [showChangeList, setShowChangeList] = useState<boolean>(false);
    const [isWordWrapEnabled, setIsWordWrapEnabled] = useState<boolean>(true);

    // Chat State
    const [chatHistory, setChatHistory] = useState<ChatEntry[]>([]);
    const [chatInput, setChatInput] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState<boolean>(false);
    const [showChat, setShowChat] = useState<boolean>(true);
    
    // New Chat Options
    const [useProModel, setUseProModel] = useState<boolean>(false); // false = Fast, true = Deep
    const [attachedImage, setAttachedImage] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const leftViewerRef = useRef<HTMLDivElement>(null);
    const rightViewerRef = useRef<HTMLDivElement>(null);
    const chatScrollRef = useRef<HTMLDivElement>(null);

    // Recompute Diff when text changes
    useEffect(() => {
        const { leftLines, rightLines, changeIndices } = computeSyncedRows(originalText, currentResult);
        setLeftData(leftLines);
        setRightData(rightLines);
        setChangeIndices(changeIndices);
        if (changeIndices.length > 0) {
            setCurrentChangeIdx(0);
        } else {
            setCurrentChangeIdx(-1);
        }
    }, [originalText, currentResult]);

    // Scroll Synchronization (Simple)
    const handleScroll = (source: 'left' | 'right') => {
        const sourceRef = source === 'left' ? leftViewerRef : rightViewerRef;
        const targetRef = source === 'left' ? rightViewerRef : leftViewerRef;
        if (sourceRef.current && targetRef.current) {
            // Check if scroll difference is significant to avoid tight loop
            if (Math.abs(targetRef.current.scrollTop - sourceRef.current.scrollTop) > 5) {
                targetRef.current.scrollTop = sourceRef.current.scrollTop;
            }
        }
    };

    // Navigate Changes
    const scrollToChange = (indexInArray: number) => {
        if (indexInArray < 0 || indexInArray >= changeIndices.length) return;
        const rowIndex = changeIndices[indexInArray];
        setCurrentChangeIdx(indexInArray);
        setShowChangeList(false);
        
        // Find DOM element
        setTimeout(() => {
            const element = document.getElementById(`line-${rowIndex}`);
            if (element) {
                 element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 10);
    };

    // History Logic
    const handleUndo = () => {
        if (historyIndex > 0) {
            const newIndex = historyIndex - 1;
            setHistoryIndex(newIndex);
            setCurrentResult(textHistory[newIndex]);
        }
    };

    const handleRedo = () => {
        if (historyIndex < textHistory.length - 1) {
            const newIndex = historyIndex + 1;
            setHistoryIndex(newIndex);
            setCurrentResult(textHistory[newIndex]);
        }
    };

    // Chat Logic
    const handleSendChat = async () => {
        if (!chatInput.trim()) return;
        const userMsg = chatInput;
        const imgToSend = attachedImage; // Capture current image state
        
        setChatInput('');
        setAttachedImage(null); // Clear image after sending
        setIsProcessing(true);

        const newEntry: ChatEntry = {
            id: Date.now().toString(),
            role: 'user',
            message: userMsg,
            timestamp: Date.now()
        };
        setChatHistory(prev => [...prev, newEntry]);

        try {
            // Pass model selection and image to the service
            const { reply, refinedText } = await onChatRefine(
                currentResult, 
                userMsg, 
                useProModel, 
                imgToSend || undefined
            );
            
            const aiEntry: ChatEntry = {
                id: (Date.now() + 1).toString(),
                role: 'ai',
                message: reply,
                proposedText: refinedText,
                timestamp: Date.now()
            };
            setChatHistory(prev => [...prev, aiEntry]);
        } catch (error) {
            console.error(error);
            setChatHistory(prev => [...prev, {
                id: Date.now().toString(),
                role: 'ai',
                message: "Error processing request.",
                timestamp: Date.now()
            }]);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleApplyFix = (entry: ChatEntry) => {
        if (entry.proposedText) {
            const newText = entry.proposedText;
            
            // Add to history
            const newHistory = textHistory.slice(0, historyIndex + 1);
            newHistory.push(newText);
            setTextHistory(newHistory);
            setHistoryIndex(newHistory.length - 1);
            
            // Update current view
            setCurrentResult(newText);
            
            // Update the entry to show applied status
            setChatHistory(prev => prev.map(e => e.id === entry.id ? { ...e, applied: true } : e));
        }
    };

    const handleChatKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendChat();
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = (reader.result as string).split(',')[1];
                setAttachedImage(base64String);
            };
            reader.readAsDataURL(file);
        }
    };

    useEffect(() => {
        if (chatScrollRef.current) {
            chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
        }
    }, [chatHistory]);


    return (
        <div className="w-full max-w-[98vw] h-[95vh] bg-gray-900 rounded-xl shadow-2xl flex flex-col animate-fade-in border border-gray-700 overflow-hidden relative">
            {/* Header with Navigator */}
            <header className="h-14 bg-gray-800 border-b border-gray-700 flex justify-between items-center px-4 flex-shrink-0 relative z-20">
                <div className="flex items-center gap-6">
                     <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <ShieldCheckIcon className="w-5 h-5 text-teal-400" />
                        Step 3 Audit
                    </h2>
                    
                    {/* Undo/Redo Controls */}
                    <div className="flex items-center space-x-1 bg-gray-900 p-1 rounded-lg border border-gray-700 ml-4">
                        <button 
                            onClick={handleUndo} 
                            disabled={historyIndex === 0}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Undo Chat Fix"
                        >
                            <UndoIcon className="w-4 h-4" />
                        </button>
                        <span className="text-xs font-mono text-gray-500 w-12 text-center select-none">
                            {historyIndex + 1}/{textHistory.length}
                        </span>
                        <button 
                            onClick={handleRedo} 
                            disabled={historyIndex === textHistory.length - 1}
                            className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            title="Redo Chat Fix"
                        >
                            <RedoIcon className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Change Navigator */}
                    {changeIndices.length > 0 && (
                        <div className="flex items-center bg-gray-900 rounded-lg border border-gray-700 p-0.5 space-x-1 relative">
                             <button 
                                onClick={() => scrollToChange(currentChangeIdx - 1)}
                                disabled={currentChangeIdx <= 0}
                                className="p-1.5 hover:bg-gray-700 rounded disabled:opacity-30 transition-colors"
                                title="Previous Change"
                             >
                                 <ArrowLeftIcon className="w-4 h-4 text-teal-400" />
                             </button>
                             
                             <div className="relative">
                                <button 
                                    onClick={() => setShowChangeList(!showChangeList)}
                                    className="text-xs font-mono text-gray-300 w-36 text-center hover:bg-gray-800 rounded py-1.5 flex items-center justify-center gap-2 transition-colors"
                                >
                                    <span>Change {currentChangeIdx + 1} of {changeIndices.length}</span>
                                    <QueueListIcon className="w-3 h-3 text-gray-500" />
                                </button>
                                
                                {/* Dropdown List of Changes */}
                                {showChangeList && (
                                    <div className="absolute top-full left-0 mt-2 w-64 bg-gray-800 border border-gray-600 rounded-lg shadow-xl max-h-80 overflow-y-auto z-50">
                                        {changeIndices.map((rowIndex, idx) => (
                                            <button
                                                key={idx}
                                                onClick={() => scrollToChange(idx)}
                                                className={`w-full text-left px-3 py-2 text-xs border-b border-gray-700 last:border-0 hover:bg-gray-700 flex items-center gap-2 ${idx === currentChangeIdx ? 'bg-teal-900/30 text-teal-300' : 'text-gray-300'}`}
                                            >
                                                <span className="font-mono text-gray-500 flex-shrink-0">#{idx + 1}</span>
                                                <span className="truncate font-mono">{rightData[rowIndex]?.text.substring(0, 30)}...</span>
                                            </button>
                                        ))}
                                    </div>
                                )}
                             </div>

                             <button 
                                onClick={() => scrollToChange(currentChangeIdx + 1)}
                                disabled={currentChangeIdx >= changeIndices.length - 1}
                                className="p-1.5 hover:bg-gray-700 rounded disabled:opacity-30 transition-colors"
                                title="Next Change"
                             >
                                 <ArrowRightIcon className="w-4 h-4 text-teal-400" />
                             </button>
                        </div>
                    )}
                </div>
                
                <div className="flex items-center gap-4">
                     {hasReference && (
                        <span className="px-2 py-1 bg-green-900/30 border border-green-800 text-green-400 text-[10px] rounded uppercase font-bold tracking-wide">
                            REF PDF Active
                        </span>
                    )}
                </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-grow flex overflow-hidden relative z-10">
                {/* Diff Viewer Container */}
                <div className="flex-grow flex flex-col min-w-0">
                    {/* Column Headers */}
                    <div className="flex border-b border-gray-700 bg-gray-800 text-xs font-semibold text-gray-400 uppercase tracking-wider h-10 flex-shrink-0 items-center">
                        <div className="flex-1 px-4 text-center border-r border-gray-700">Original (Pre-Audit)</div>
                        <div className="flex-1 px-4 text-center text-teal-400">Corrected Result</div>
                    </div>
                    
                    <div className="flex-grow flex overflow-hidden">
                        {/* LEFT: Original */}
                        <div className="flex-1 border-r border-gray-700 bg-gray-900/50 overflow-hidden flex flex-col">
                            <StructuredTextViewer 
                                ref={leftViewerRef}
                                onScroll={() => handleScroll('left')}
                                lines={leftData} 
                                isWordWrapEnabled={isWordWrapEnabled} 
                            />
                        </div>
                        
                        {/* RIGHT: New */}
                        <div className="flex-1 bg-gray-900 overflow-hidden flex flex-col">
                             <StructuredTextViewer 
                                ref={rightViewerRef}
                                onScroll={() => handleScroll('right')}
                                lines={rightData} 
                                isWordWrapEnabled={isWordWrapEnabled}
                                highlightedIndices={currentChangeIdx !== -1 ? [changeIndices[currentChangeIdx]] : []}
                            />
                        </div>
                    </div>
                </div>

                {/* Chat Panel */}
                {showChat && (
                    <div className="w-96 border-l border-gray-700 bg-gray-800 flex flex-col flex-shrink-0 transition-all duration-300">
                        {/* Chat Header - Aligned with Viewer Headers */}
                        <div className="h-10 border-b border-gray-700 bg-gray-800 flex items-center justify-between px-3 flex-shrink-0">
                             <span className="font-bold text-gray-200 text-sm">Assistant</span>
                             <div className="flex items-center gap-1">
                                <button 
                                    onClick={() => setIsWordWrapEnabled(!isWordWrapEnabled)}
                                    className={`p-1.5 rounded text-xs transition-colors ${isWordWrapEnabled ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-700'}`}
                                    title="Toggle Word Wrap"
                                >
                                    <WordWrapIcon className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                    onClick={() => setShowChat(false)}
                                    className="px-2 py-1 bg-teal-700 hover:bg-teal-600 text-white text-xs rounded transition-colors flex items-center gap-1"
                                >
                                    <ChatBubbleLeftRightIcon className="w-3 h-3" />
                                    Hide Chat
                                </button>
                             </div>
                        </div>
                        
                        <div ref={chatScrollRef} className="flex-grow overflow-y-auto p-4 space-y-4 bg-gray-800">
                            {chatHistory.length === 0 && (
                                <div className="text-center text-gray-500 text-sm mt-10 px-4">
                                    <SparklesIcon className="w-8 h-8 mx-auto mb-3 opacity-30" />
                                    <p>Ask me to check footnotes, verify structure, or fix specific errors.</p>
                                </div>
                            )}
                            {chatHistory.map((entry) => (
                                <div key={entry.id} className={`flex flex-col ${entry.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[90%] p-3 rounded-lg text-sm whitespace-pre-wrap ${entry.role === 'user' ? 'bg-teal-700 text-white rounded-br-none' : 'bg-gray-700 text-gray-200 rounded-bl-none'}`}>
                                        <p>{entry.message}</p>
                                    </div>
                                    {entry.proposedText && (
                                        <div className="mt-2 p-3 bg-gray-900 border border-gray-600 rounded-lg w-full max-w-[95%]">
                                            <div className="text-xs text-gray-400 mb-2 uppercase font-bold flex items-center gap-1">
                                                <SparklesIcon className="w-3 h-3 text-yellow-400" />
                                                Proposed Fix
                                            </div>
                                            <div className="text-xs font-mono text-gray-500 line-clamp-3 mb-2 bg-black/30 p-1 rounded">
                                                {entry.proposedText.substring(0, 100)}...
                                            </div>
                                            {entry.applied ? (
                                                <button disabled className="w-full py-1 bg-green-900/50 text-green-400 text-xs font-bold rounded border border-green-800">
                                                    Applied ✓
                                                </button>
                                            ) : (
                                                <button 
                                                    onClick={() => handleApplyFix(entry)}
                                                    className="w-full py-1 bg-teal-600 hover:bg-teal-500 text-white text-xs font-bold rounded transition-colors"
                                                >
                                                    Apply This Fix
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <span className="text-[10px] text-gray-500 mt-1">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                                </div>
                            ))}
                            {isProcessing && (
                                <div className="flex items-start">
                                     <div className="bg-gray-700 p-3 rounded-lg rounded-bl-none">
                                        <div className="flex space-x-1">
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                                        </div>
                                     </div>
                                </div>
                            )}
                        </div>

                        <div className="p-3 border-t border-gray-700 bg-gray-900">
                            {/* Controls: Model Switcher & Image Attachment */}
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex bg-gray-800 p-0.5 rounded-lg border border-gray-700">
                                    <button 
                                        onClick={() => setUseProModel(false)}
                                        className={`px-2 py-1 text-[10px] flex items-center gap-1 rounded transition-colors ${!useProModel ? 'bg-teal-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                        title="Fast, lightweight model"
                                    >
                                        <LightningIcon className="w-3 h-3" />
                                        Fast
                                    </button>
                                    <button 
                                        onClick={() => setUseProModel(true)}
                                        className={`px-2 py-1 text-[10px] flex items-center gap-1 rounded transition-colors ${useProModel ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-400 hover:text-white'}`}
                                        title="Deep reasoning, rigorous model"
                                    >
                                        <BrainIcon className="w-3 h-3" />
                                        Deep
                                    </button>
                                </div>
                                <div className="relative">
                                    <button 
                                        onClick={() => fileInputRef.current?.click()}
                                        className={`p-1.5 rounded transition-colors ${attachedImage ? 'text-teal-400 bg-teal-900/30 ring-1 ring-teal-500' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}
                                        title="Attach Image"
                                    >
                                        <PaperClipIcon className="w-4 h-4" />
                                    </button>
                                    <input 
                                        type="file" 
                                        ref={fileInputRef} 
                                        className="hidden" 
                                        accept="image/jpeg, image/png, image/webp" 
                                        onChange={handleImageUpload} 
                                    />
                                </div>
                            </div>

                            {/* Image Preview */}
                            {attachedImage && (
                                <div className="mb-2 relative inline-block">
                                    <img src={`data:image/jpeg;base64,${attachedImage}`} alt="Attachment" className="h-16 w-auto rounded border border-gray-600 object-cover" />
                                    <button 
                                        onClick={() => { setAttachedImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                                        className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-xs shadow-md hover:bg-red-500"
                                    >
                                        &times;
                                    </button>
                                </div>
                            )}

                            <div className="flex gap-2 items-center">
                                <textarea
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={handleChatKeyDown}
                                    placeholder="Ask about structure, footnotes, or fix errors..."
                                    className="flex-grow bg-gray-800 text-white text-sm p-3 rounded border border-gray-600 focus:border-teal-500 outline-none resize-none h-[46px] leading-tight"
                                    rows={1}
                                    disabled={isProcessing}
                                />
                                <button 
                                    onClick={handleSendChat}
                                    disabled={!chatInput.trim() || isProcessing}
                                    className={`p-3 rounded text-white h-[46px] w-[46px] flex items-center justify-center flex-shrink-0 transition-colors ${!chatInput.trim() || isProcessing ? 'bg-gray-700 opacity-50 cursor-not-allowed' : 'bg-teal-600 hover:bg-teal-500'}`}
                                >
                                    <ArrowRightIcon className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Footer */}
            <footer className="p-4 bg-gray-800 border-t border-gray-700 flex justify-between items-center flex-shrink-0 relative z-20">
                <button
                    onClick={onCancel}
                    className="px-6 py-2 bg-gray-700 text-gray-300 font-bold rounded hover:bg-gray-600 transition-colors"
                >
                    Cancel Audit
                </button>
                <button
                    onClick={() => onConfirm(currentResult)}
                    className="px-8 py-2 bg-green-600 text-white font-bold rounded hover:bg-green-500 transition-colors shadow-lg shadow-green-900/20 flex items-center gap-2"
                >
                    <ShieldCheckIcon className="w-5 h-5" />
                    Complete Step 3
                </button>
            </footer>
        </div>
    );
};
