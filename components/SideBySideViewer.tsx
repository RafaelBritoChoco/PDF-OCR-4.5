import React from 'react';
import { StructuredTextViewer } from './StructuredTextViewer';

interface SideBySideViewerProps {
  originalText: string;
  translatedText: string;
  originalLang: string;
  isWordWrapEnabled: boolean;
}

export const SideBySideViewer: React.FC<SideBySideViewerProps> = ({ originalText, translatedText, originalLang, isWordWrapEnabled }) => {
  return (
    <div className="grid grid-cols-2 h-full gap-2">
      <div className="flex flex-col h-full overflow-hidden border border-gray-700 rounded-lg">
        <h3 className="text-center font-semibold text-gray-300 p-2 flex-shrink-0 bg-gray-800 border-b border-gray-700">Original ({originalLang})</h3>
        <StructuredTextViewer text={originalText} isWordWrapEnabled={isWordWrapEnabled} />
      </div>
      <div className="flex flex-col h-full overflow-hidden border border-gray-700 rounded-lg">
        <h3 className="text-center font-semibold text-gray-300 p-2 flex-shrink-0 bg-gray-800 border-b border-gray-700">English (Tradução)</h3>
        {translatedText ? (
            <StructuredTextViewer text={translatedText} isWordWrapEnabled={isWordWrapEnabled} />
        ) : (
            <div className="flex items-center justify-center h-full text-gray-500 bg-gray-900">
                <p>A tradução aparecerá aqui.</p>
            </div>
        )}
      </div>
    </div>
  );
};