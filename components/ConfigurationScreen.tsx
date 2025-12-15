import React from 'react';
import { LoaderIcon, SparklesIcon } from './icons';
import { ProcessingState } from '../types';

interface ConfigurationScreenProps {
  value: number;
  onValueChange: (newValue: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
  max: number;
  isDetectingLanguage?: boolean;
  onDetectLanguage?: () => void;
  documentLanguage?: string;
  onDocumentLanguageChange?: (lang: string) => void;
  supportedLanguages?: { name: string }[];
  hideChunkSlider?: boolean;
  processingState: ProcessingState; 
}

export const ConfigurationScreen: React.FC<ConfigurationScreenProps> = ({
  value,
  onValueChange,
  onConfirm,
  onCancel,
  max,
  isDetectingLanguage,
  onDetectLanguage,
  documentLanguage,
  onDocumentLanguageChange,
  supportedLanguages,
  hideChunkSlider = false,
  processingState,
}) => {
  const showLanguageSelector = documentLanguage && onDocumentLanguageChange && supportedLanguages && onDetectLanguage;

  const titles: { [key in ProcessingState]?: string } = {
    [ProcessingState.CONFIGURING_CLEANING]: "Configure Text Cleaning",
    [ProcessingState.CONFIGURING_HEADLINES]: "Configure Step 1: Headlines",
    [ProcessingState.CONFIGURING_CONTENT]: "Configure Step 2: Content",
  };
  const descriptions: { [key in ProcessingState]?: string } = {
      [ProcessingState.CONFIGURING_CLEANING]: "Adjust AI granularity for cleaning. Fewer chunks are faster, but more chunks might be more precise in identifying headers/footers.",
      [ProcessingState.CONFIGURING_HEADLINES]: "AI granularity is automatically set to optimize performance. Click Start to continue.",
      [ProcessingState.CONFIGURING_CONTENT]: "The AI will process the document section by section for maximum precision. Click Start to continue.",
  };

  const title = titles[processingState] || "Configure Process";
  const description = descriptions[processingState] || "Define parameters for the next step.";


  return (
    <div className="w-full max-w-2xl p-8 bg-gray-800 rounded-xl shadow-2xl flex flex-col items-center space-y-6 animate-fade-in">
        <h2 className="text-2xl font-bold text-white">{title}</h2>
        <p className="text-center text-gray-400">
            {description}
        </p>

        {showLanguageSelector && (
            <div className="w-full pt-4 space-y-2 border-t border-gray-700/50">
                <label htmlFor="language-select" className="block text-sm font-medium text-gray-300">Document Language</label>
                <div className="flex items-center space-x-2">
                    <select
                        id="language-select"
                        value={documentLanguage}
                        onChange={(e) => onDocumentLanguageChange(e.target.value)}
                        className="bg-gray-700 border border-gray-600 text-white text-sm rounded-lg focus:ring-teal-500 focus:border-teal-500 block w-full p-2.5"
                    >
                        {supportedLanguages.map(lang => <option key={lang.name} value={lang.name}>{lang.name}</option>)}
                    </select>
                    <button 
                        onClick={onDetectLanguage} 
                        disabled={isDetectingLanguage}
                        className="p-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 transition-colors disabled:bg-indigo-800 disabled:cursor-wait flex-shrink-0"
                        title="Detect Language with AI"
                    >
                        {isDetectingLanguage ? <LoaderIcon className="w-5 h-5" /> : <SparklesIcon className="w-5 h-5" />}
                    </button>
                </div>
            </div>
        )}
        
        {!hideChunkSlider && (
          <div className="w-full space-y-4 pt-4 border-t border-gray-700/50">
              <label htmlFor="chunk-slider" className="block text-lg font-semibold text-center text-gray-200">
                  Granularity Level: <span className="font-bold text-teal-300">{value}</span> chunks
              </label>
              <input
                  id="chunk-slider"
                  type="range"
                  min="1"
                  max={max}
                  value={value}
                  onChange={(e) => onValueChange(parseInt(e.target.value, 10))}
                  className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg"
              />
              <div className="flex justify-between text-xs text-gray-500">
                  <span>Fewer Chunks (Faster)</span>
                  <span>More Chunks (Precise)</span>
              </div>
          </div>
        )}

        <div className="w-full flex items-center justify-between space-x-4 pt-6 border-t border-gray-700">
            <button
                onClick={onCancel}
                className="w-1/3 px-6 py-3 bg-gray-600 text-white font-bold rounded-md hover:bg-gray-500 transition-colors text-lg"
            >
                Back
            </button>
            <button
                onClick={onConfirm}
                className="w-2/3 px-6 py-3 bg-teal-600 text-white font-bold rounded-md hover:bg-teal-500 transition-colors text-lg"
            >
                Start Analysis
            </button>
        </div>
    </div>
  );
};