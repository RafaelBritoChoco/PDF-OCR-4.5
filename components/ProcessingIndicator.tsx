
import React, { useEffect, useRef } from 'react';
import { ProcessingState } from '../types';

interface ProcessingIndicatorProps {
  progress: number;
  
  // For page-based tasks like Extraction/OCR
  state?: ProcessingState;
  totalPages?: number;
  
  // For AI chunk-based tasks, providing detailed feedback
  title?: string;
  currentActivity?: string;
  activityLog?: string[];
  onStop?: () => void; // Added onStop prop
}

const simpleStateConfig: Partial<Record<ProcessingState, { title: string }>> = {
  [ProcessingState.EXTRACTING]: {
    title: 'Extracting Text from PDF',
  },
  [ProcessingState.OCR]: {
    title: 'Performing OCR with AI',
  },
  [ProcessingState.TRANSFORMING_JSON]: {
    title: 'Transforming JSON with AI',
  },
};


export const ProcessingIndicator: React.FC<ProcessingIndicatorProps> = ({ 
  progress,
  state,
  totalPages,
  title,
  currentActivity,
  activityLog,
  onStop,
}) => {
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logContainerRef.current) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [activityLog]);
  
  // If `title` is provided, we are in the detailed AI processing mode.
  if (title && currentActivity !== undefined && activityLog) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-8 space-y-6 bg-gray-800/50 rounded-xl max-w-2xl w-full animate-fade-in border border-gray-700 shadow-2xl">
        <div className="relative">
             <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-teal-400"></div>
        </div>
        
        <h2 className="text-2xl font-bold text-gray-200">{title}</h2>
        
        <p className="text-gray-300 transition-opacity duration-500 h-6 font-medium">
          {currentActivity}
        </p>
        
        <div className="w-full bg-gray-700 rounded-full h-2.5">
          <div
            className="bg-teal-400 h-2.5 rounded-full transition-all duration-300 ease-linear shadow-[0_0_10px_rgba(45,212,191,0.5)]"
            style={{ width: `${progress}%` }}
          ></div>
        </div>

        <div className="w-full text-left bg-gray-950/80 p-4 rounded-lg h-56 overflow-y-auto font-mono text-xs border border-gray-700 shadow-inner" ref={logContainerRef}>
          <h3 className="text-gray-400 font-semibold mb-2 border-b border-gray-800 pb-1 sticky top-0 bg-gray-950/80 backdrop-blur-sm">Activity Log:</h3>
          {activityLog.length === 0 && <p className="text-gray-600 italic animate-pulse">Waiting for process to start...</p>}
          {activityLog.map((log, index) => {
             // Highlight time durations in the log
             const parts = log.split(/(\(\d+\.?\d*s\))/);
             return (
                <p key={index} className="text-gray-400 animate-fade-in leading-relaxed border-b border-gray-800/50 pb-0.5 mb-0.5">
                  <span className="text-teal-500 mr-2 opacity-70">{'>'}</span>
                  {parts.map((part, i) => 
                    part.match(/^\(\d+\.?\d*s\)$/) 
                        ? <span key={i} className="text-yellow-400 font-bold ml-1">{part}</span> 
                        : <span key={i}>{part}</span>
                  )}
                </p>
             );
          })}
        </div>

        <div className="flex flex-col space-y-2 w-full">
            <p className="text-sm text-gray-500">
            Please wait, this may take a moment for large or complex files.
            </p>
            {onStop && (
                <button 
                    onClick={onStop}
                    className="mt-4 px-4 py-2 bg-red-900/50 hover:bg-red-800/80 text-red-200 border border-red-800 rounded-md transition-all text-sm font-semibold uppercase tracking-wider hover:shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                >
                    Stop / Cancel Process
                </button>
            )}
        </div>
      </div>
    );
  }

  // Fallback to the original, simpler indicator for page-based tasks
  const config = state ? simpleStateConfig[state] : null;

  const getPageBasedMessage = () => {
    if (state && totalPages && totalPages > 0) {
      const currentPage = Math.max(1, Math.ceil((progress / 100) * totalPages));
      const action = state === ProcessingState.OCR ? 'Analyzing' : 'Extracting text from';
      return `${action} page ${currentPage} of ${totalPages}...`;
    }
    return "Processing your file...";
  }
  
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 space-y-6 bg-gray-800/50 rounded-xl max-w-2xl w-full border border-gray-700">
      <div className="w-16 h-16 border-4 border-dashed rounded-full animate-spin border-teal-400"></div>
      <h2 className="text-2xl font-bold text-gray-200">{config?.title || 'Processing...'}</h2>
      <p className="text-gray-400 transition-opacity duration-500">
        {getPageBasedMessage()}
      </p>
      
      <div className="w-full bg-gray-700 rounded-full h-2.5 mt-2">
        <div
          className="bg-teal-400 h-2.5 rounded-full transition-all duration-300 ease-linear"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
      
       {onStop && (
            <button 
                onClick={onStop}
                className="mt-4 px-6 py-2 bg-red-900/50 hover:bg-red-800/80 text-red-200 border border-red-800 rounded-md transition-all text-sm font-semibold"
            >
                Stop Process
            </button>
        )}
    </div>
  );
};
