import React from 'react';
import type { ApiCallTracker } from '../hooks/usePerformanceTracker';

interface PerformanceTrackerProps {
  elapsedTime: number;
  apiCalls: ApiCallTracker;
  isVisible: boolean;
}

const formatTime = (totalSeconds: number): string => {
    if (totalSeconds < 60) {
        return `${totalSeconds.toFixed(1)}s`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}m ${seconds}s`;
};

export const PerformanceTracker: React.FC<PerformanceTrackerProps> = ({ elapsedTime, apiCalls, isVisible }) => {
  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 bg-gray-800/90 backdrop-blur-sm text-white p-3 rounded-lg shadow-lg z-50 animate-fade-in-up text-sm border border-gray-700">
      <div className="flex flex-col items-end space-y-1">
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">Time:</span>
          <span className="font-mono text-teal-300 w-24 text-right">{formatTime(elapsedTime)}</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-gray-400">API Calls:</span>
           <span className="font-mono text-sky-300 w-24 text-right">
                F: {apiCalls.flash} | P: {apiCalls.pro}
            </span>
        </div>
      </div>
    </div>
  );
};