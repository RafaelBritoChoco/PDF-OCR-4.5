
import React, { useState, useEffect } from 'react';
import { generateDiff, DiffResult } from '../services/diffService';
import { LoaderIcon } from './icons';

interface DiffViewerProps {
  oldText: string;
  newText: string;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ oldText, newText }) => {
  const [diff, setDiff] = useState<DiffResult[] | null>(null);
  const [isCalculating, setIsCalculating] = useState(true);

  useEffect(() => {
    setIsCalculating(true);
    setDiff(null);

    // We wrap the calculation in a setTimeout to allow the UI to render the 
    // loading state before the heavy synchronous calculation blocks the main thread.
    const timer = setTimeout(() => {
        // Simple optimization: check length to avoid catastrophic freezes on massive files
        // If > 2M chars, we might want to warn, but for now we just process.
        // The loading indicator handles the "user thinks it froze" issue.
        try {
            const result = generateDiff(oldText, newText);
            setDiff(result);
        } catch (error) {
            console.error("Diff calculation failed:", error);
            // Fallback for errors
            setDiff([{ type: 'common', line: 'Error calculating differences. The file might be too large.' }]);
        } finally {
            setIsCalculating(false);
        }
    }, 100);

    return () => clearTimeout(timer);
  }, [oldText, newText]);

  if (isCalculating || !diff) {
      return (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] space-y-4 bg-gray-900 rounded-md border border-gray-700 animate-fade-in">
              <LoaderIcon className="w-12 h-12 text-teal-500 animate-spin" />
              <div className="text-center space-y-2">
                  <h3 className="text-xl font-semibold text-gray-200">Analyzing Differences...</h3>
                  <p className="text-sm text-gray-400">Comparing original vs. processed text.</p>
                  <p className="text-xs text-gray-500">For large documents, this calculation may take a moment.</p>
              </div>
          </div>
      );
  }

  const getLineClass = (type: DiffResult['type']) => {
    switch (type) {
      case 'added':
        return 'bg-green-900/40 border-l-4 border-green-500/50';
      case 'removed':
        return 'bg-red-900/40 border-l-4 border-red-500/50 opacity-80';
      default:
        return 'border-l-4 border-transparent hover:bg-gray-800/30';
    }
  };

  const getLineSymbol = (type: DiffResult['type']) => {
    switch (type) {
      case 'added':
        return '+';
      case 'removed':
        return '-';
      default:
        return ' ';
    }
  };

  return (
    <div className="font-mono text-sm bg-gray-900 p-4 rounded-md border border-gray-700 h-full overflow-auto shadow-inner">
      <div className="flex flex-col min-w-full w-fit">
        {diff.map((item, index) => (
          <div key={index} className={`flex py-0.5 ${getLineClass(item.type)}`} dir="auto">
            <span className={`w-8 text-center select-none flex-shrink-0 font-bold ${item.type === 'added' ? 'text-green-500' : item.type === 'removed' ? 'text-red-500' : 'text-gray-600'}`}>
                {getLineSymbol(item.type)}
            </span>
            <span className="flex-grow break-words whitespace-pre-wrap pr-4 text-gray-300">
                {item.line || ' '}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};
