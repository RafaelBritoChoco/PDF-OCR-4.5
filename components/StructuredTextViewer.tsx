
import React from 'react';

// Added new prop type for custom line rendering
export interface ViewerLineData {
    text: string;
    status: 'normal' | 'added' | 'removed' | 'empty';
}

interface StructuredTextViewerProps extends React.HTMLAttributes<HTMLDivElement> {
  text?: string;
  lines?: ViewerLineData[]; // Optional prop for Diff Mode
  isWordWrapEnabled: boolean;
  highlightedIndices?: number[]; // For search/navigation highlights
}

const getTagClass = (tagContent: string): string => {
  if (tagContent.includes('level0')) return 'text-red-400';
  if (tagContent.includes('level1')) return 'text-orange-400';
  if (tagContent.includes('level2')) return 'text-yellow-400';
  if (tagContent.includes('level3')) return 'text-cyan-400';
  if (tagContent.includes('level4')) return 'text-blue-400';
  if (tagContent.includes('level5')) return 'text-indigo-400';
  if (tagContent.includes('level')) return 'text-green-400'; // Fallback for other levels
  if (tagContent.includes('text_level')) return 'text-gray-500 font-semibold';
  if (tagContent.includes('footnote')) return 'text-purple-400';
  return 'text-gray-500';
};

export const StructuredTextViewer = React.forwardRef<HTMLDivElement, StructuredTextViewerProps>(({ text, lines: customLines, isWordWrapEnabled, highlightedIndices = [], ...props }, ref) => {
  // Use customLines if provided, otherwise split text
  const displayLines = customLines || (text || '').split('\n').map(l => ({ text: l, status: 'normal' as const }));

  return (
    <div ref={ref} className="w-full h-full bg-gray-900 text-gray-300 overflow-auto font-mono text-sm" dir="auto" {...props}>
      <pre className={isWordWrapEnabled ? "whitespace-pre-wrap" : "whitespace-pre"}>
        {displayLines.map((lineData, lineIndex) => {
          const isComment = lineData.text.trim().startsWith('//');
          const isHighlighted = highlightedIndices.includes(lineIndex);
          
          let bgClass = 'hover:bg-gray-800/50';
          if (lineData.status === 'added') bgClass = 'bg-green-900/30 hover:bg-green-900/40';
          if (lineData.status === 'removed') bgClass = 'bg-red-900/30 hover:bg-red-900/40 opacity-70';
          if (isHighlighted) bgClass = 'bg-blue-600/30 hover:bg-blue-600/40 ring-1 ring-blue-500';
          
          if (isComment) bgClass = 'bg-yellow-900/10';

          return (
            <div key={lineIndex} id={`line-${lineIndex}`} className={`line-container flex ${bgClass}`}>
              <span className="w-12 flex-shrink-0 select-none text-right pr-4 text-gray-600 border-r border-gray-800 mr-2">{lineData.status !== 'empty' ? lineIndex + 1 : ''}</span>
              <div className={`flex-grow pr-4 ${isWordWrapEnabled ? 'break-words min-w-0' : ''} ${isComment ? 'text-gray-500 italic' : ''}`}>
                {lineData.status === 'empty' ? (
                     <span className="select-none text-transparent">.</span>
                ) : isComment ? (
                   // Render comment whole
                   <span>{lineData.text}</span>
                ) : (
                   // Render standard tags
                   lineData.text.split(/({{[^{}]+}})/g).filter(Boolean).map((part, partIndex) => {
                    const isTag = part.startsWith('{{') && part.endsWith('}}');
                    if (isTag) {
                      return (
                        <span key={partIndex} className={getTagClass(part)}>
                          {part}
                        </span>
                      );
                    }
                    return <span key={partIndex}>{part}</span>;
                  })
                )}
                {lineData.text.trim() === '' && lineData.status !== 'empty' && '\u00A0'}
              </div>
            </div>
          );
        })}
      </pre>
    </div>
  );
});
