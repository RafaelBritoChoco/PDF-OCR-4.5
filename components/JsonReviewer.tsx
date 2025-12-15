

import React, { useState } from 'react';
import { ShieldCheckIcon } from './icons';

interface JsonReviewerProps {
  initialJson: string;
  onConfirm: (editedJson: string) => void;
  onCancel: () => void;
}

export const JsonReviewer: React.FC<JsonReviewerProps> = ({ initialJson, onConfirm, onCancel }) => {
  const [jsonText, setJsonText] = useState(initialJson);

  const handleConfirm = () => {
    onConfirm(jsonText);
  };

  return (
    <div className="w-full max-w-4xl h-[85vh] bg-gray-800 rounded-xl shadow-2xl flex flex-col animate-fade-in">
      <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
        <h2 className="text-lg font-bold text-white">Review and Edit JSON</h2>
        <p className="text-sm text-gray-400">
          Modify the JSON structure as desired before transforming it to text.
        </p>
      </header>
      
      <main className="flex-grow flex flex-col p-4 overflow-hidden">
        <div className="flex-grow bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
          <textarea
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
              className="w-full h-full p-4 bg-gray-900 text-gray-300 font-mono text-sm resize-none border-0 focus:ring-1 focus:ring-teal-500"
              spellCheck="false"
          />
        </div>
      </main>

      <footer className="p-4 border-t border-gray-700 flex justify-between items-center flex-shrink-0">
        <button
            onClick={onCancel}
            className="px-4 py-2 bg-red-600 text-white font-bold rounded-md hover:bg-red-500 transition-colors"
        >
            Cancel
        </button>
        <button
          onClick={handleConfirm}
          className="px-6 py-3 bg-teal-600 text-white font-bold rounded-md hover:bg-teal-500 transition-colors flex items-center text-lg"
        >
          <ShieldCheckIcon className="w-6 h-6 mr-2"/>
          Confirm and Transform
        </button>
      </footer>
    </div>
  );
};