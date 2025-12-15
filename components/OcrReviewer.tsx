

import React, { useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, ShieldCheckIcon, ZoomInIcon, ZoomOutIcon, QueueListIcon, DocumentIcon, UndoIcon } from './icons';
import { OcrPage } from '../types';

interface OcrReviewerProps {
  pages: OcrPage[];
  onConfirm: (editedTexts: string[]) => void;
  onCancel: () => void;
}

export const OcrReviewer: React.FC<OcrReviewerProps> = ({ pages, onConfirm, onCancel }) => {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [pageTexts, setPageTexts] = useState<string[]>(() => pages.map(p => p.ocrText));
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewMode, setViewMode] = useState<'paged' | 'list'>('paged');

  const handleTextChange = (index: number, newText: string) => {
    const newTexts = [...pageTexts];
    newTexts[index] = newText;
    setPageTexts(newTexts);
  };

  const goToPrevious = () => {
    setCurrentPageIndex(prev => Math.max(0, prev - 1));
  };

  const goToNext = () => {
    setCurrentPageIndex(prev => Math.min(pages.length - 1, prev + 1));
  };

  const handleConfirm = () => {
    onConfirm(pageTexts);
  };
  
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.25, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  const renderSinglePage = () => {
      const currentPage = pages[currentPageIndex];
      return (
        <main className="flex-grow grid grid-cols-1 md:grid-cols-2 gap-4 p-4 overflow-hidden">
            <div className="flex flex-col bg-gray-900 rounded-lg overflow-hidden border border-gray-700 relative">
                <div className="flex justify-between items-center p-2 bg-gray-800 border-b border-gray-700 z-10">
                    <h3 className="text-center font-semibold text-sm">Page {currentPageIndex + 1}</h3>
                    <div className="flex items-center space-x-2">
                        <button onClick={handleZoomOut} className="p-1 hover:bg-gray-700 rounded text-gray-300" title="Zoom Out"><ZoomOutIcon className="w-4 h-4" /></button>
                        <button onClick={handleResetZoom} className="text-xs font-mono text-gray-400 w-12 text-center hover:text-white" title="Reset Zoom">{Math.round(zoomLevel * 100)}%</button>
                        <button onClick={handleZoomIn} className="p-1 hover:bg-gray-700 rounded text-gray-300" title="Zoom In"><ZoomInIcon className="w-4 h-4" /></button>
                    </div>
                </div>
                <div className="flex-grow overflow-auto bg-gray-950 flex items-start justify-center p-2">
                    <img 
                        src={`data:image/jpeg;base64,${currentPage.imageBase64}`} 
                        alt={`Page ${currentPageIndex + 1}`}
                        style={{ 
                            width: `${zoomLevel * 100}%`,
                            maxWidth: 'none',
                            height: 'auto',
                            transition: 'width 0.2s ease-out'
                        }}
                    />
                </div>
            </div>
            <div className="flex flex-col bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                 <h3 className="text-center font-semibold p-2 bg-gray-800 border-b border-gray-700 text-sm">Extracted Text (Editable)</h3>
                <textarea
                    value={pageTexts[currentPageIndex]}
                    onChange={(e) => handleTextChange(currentPageIndex, e.target.value)}
                    className="w-full h-full p-4 bg-gray-900 text-gray-300 font-mono text-sm resize-none border-0 focus:ring-1 focus:ring-teal-500"
                    spellCheck="false"
                    dir="auto"
                />
            </div>
        </main>
      );
  };

  const renderListView = () => {
      return (
        <main className="flex-grow p-4 overflow-y-auto space-y-8 bg-gray-900/50">
            {pages.map((page, index) => (
                <div key={index} className="flex flex-col md:flex-row gap-4 p-4 bg-gray-800 rounded-xl border border-gray-700">
                    <div className="flex-1 flex flex-col">
                        <div className="flex justify-between items-center p-2 border-b border-gray-700 mb-2">
                            <h3 className="font-bold text-gray-300">Page {index + 1}</h3>
                             <div className="flex items-center space-x-2">
                                <button onClick={handleZoomOut} className="p-1 hover:bg-gray-700 rounded text-gray-300"><ZoomOutIcon className="w-4 h-4" /></button>
                                <span className="text-xs font-mono text-gray-400">{Math.round(zoomLevel * 100)}%</span>
                                <button onClick={handleZoomIn} className="p-1 hover:bg-gray-700 rounded text-gray-300"><ZoomInIcon className="w-4 h-4" /></button>
                            </div>
                        </div>
                         <div className="flex-grow overflow-auto bg-gray-950 rounded-lg border border-gray-700 max-h-[600px] flex items-start justify-center">
                            <img 
                                src={`data:image/jpeg;base64,${page.imageBase64}`} 
                                alt={`Page ${index + 1}`}
                                style={{ width: `${zoomLevel * 100}%`, maxWidth: 'none', transition: 'width 0.2s ease-out' }}
                                className="p-2"
                            />
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col">
                         <h3 className="font-semibold text-gray-400 p-2 mb-2">Extracted Text</h3>
                         <textarea
                            value={pageTexts[index]}
                            onChange={(e) => handleTextChange(index, e.target.value)}
                            className="w-full h-[600px] p-4 bg-gray-900 text-gray-300 font-mono text-sm resize-none border border-gray-700 rounded-lg focus:ring-1 focus:ring-teal-500"
                            spellCheck="false"
                            dir="auto"
                        />
                    </div>
                </div>
            ))}
        </main>
      );
  };

  return (
    <div className="w-full max-w-[95vw] h-[90vh] bg-gray-800 rounded-xl shadow-2xl flex flex-col animate-fade-in border border-gray-700">
      <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0 bg-gray-800 rounded-t-xl">
        <div>
            <h2 className="text-lg font-bold text-white">OCR Review</h2>
            <p className="text-sm text-gray-400">Verify and correct the extracted text.</p>
        </div>
        
        <div className="flex bg-gray-700 rounded-lg p-1 space-x-1">
            <button 
                onClick={() => setViewMode('paged')}
                className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'paged' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-600/50'}`}
                title="Paged Mode"
            >
                <DocumentIcon className="w-4 h-4 mr-2" />
                Paged
            </button>
            <button 
                onClick={() => setViewMode('list')}
                className={`flex items-center px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'list' ? 'bg-gray-600 text-white shadow-sm' : 'text-gray-400 hover:text-white hover:bg-gray-600/50'}`}
                title="List Mode (Scroll)"
            >
                <QueueListIcon className="w-4 h-4 mr-2" />
                List
            </button>
        </div>
      </header>
      
      {viewMode === 'paged' ? renderSinglePage() : renderListView()}

      <footer className="p-4 border-t border-gray-700 flex justify-between items-center flex-shrink-0 bg-gray-800 rounded-b-xl">
        <button
            onClick={onCancel}
            className="px-4 py-2 bg-red-600/90 text-white font-bold rounded-md hover:bg-red-500 transition-colors"
        >
            Cancel
        </button>

        {viewMode === 'paged' && (
            <div className="flex items-center space-x-4 bg-gray-900/50 px-4 py-2 rounded-full border border-gray-700">
            <button onClick={goToPrevious} disabled={currentPageIndex === 0} className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ArrowLeftIcon className="w-5 h-5 text-teal-400" />
            </button>
            <span className="font-mono text-sm font-medium text-gray-200">
                {currentPageIndex + 1} <span className="text-gray-500">/</span> {pages.length}
            </span>
            <button onClick={goToNext} disabled={currentPageIndex === pages.length - 1} className="p-1 rounded-full hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                <ArrowRightIcon className="w-5 h-5 text-teal-400" />
            </button>
            </div>
        )}

        <button
            onClick={handleConfirm}
            className="px-6 py-2 bg-teal-600 text-white font-bold rounded-md hover:bg-teal-500 transition-colors flex items-center shadow-lg shadow-teal-900/20"
        >
            <ShieldCheckIcon className="w-5 h-5 mr-2"/>
            Confirm All
        </button>
      </footer>
    </div>
  );
};