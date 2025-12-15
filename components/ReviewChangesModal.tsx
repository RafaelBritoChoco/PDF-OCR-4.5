

import React from 'react';
import { DiffViewer } from './DiffViewer';

interface ReviewChangesModalProps {
  isOpen: boolean;
  title: string;
  oldText: string;
  newText: string;
  onAccept: () => void;
  onReject: () => void;
  isReviewOnly?: boolean;
}

export const ReviewChangesModal: React.FC<ReviewChangesModalProps> = ({
  isOpen,
  title,
  oldText,
  newText,
  onAccept,
  onReject,
  isReviewOnly = false,
}) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="w-full max-w-6xl h-[90vh] bg-gray-800 rounded-xl shadow-2xl flex flex-col">
        <header className="p-6 border-b border-gray-700 flex-shrink-0">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <p className="text-gray-400">Review changes made by AI. Green lines were added, red lines were removed.</p>
        </header>

        <main className="p-6 flex-grow overflow-hidden">
          <DiffViewer oldText={oldText} newText={newText} />
        </main>

        <footer className="p-6 border-t border-gray-700 flex justify-end items-center space-x-4 flex-shrink-0">
          {isReviewOnly ? (
             <button
                onClick={onReject} // Use onReject as the close handler
                className="px-6 py-3 bg-gray-600 text-white font-bold rounded-md hover:bg-gray-500 transition-colors text-lg"
              >
                Close
              </button>
          ) : (
            <>
              <button
                onClick={onReject}
                className="px-6 py-3 bg-gray-600 text-white font-bold rounded-md hover:bg-gray-500 transition-colors text-lg"
              >
                Reject Changes
              </button>
              <button
                onClick={onAccept}
                className="px-6 py-3 bg-teal-600 text-white font-bold rounded-md hover:bg-teal-500 transition-colors text-lg"
              >
                Accept Changes
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
};