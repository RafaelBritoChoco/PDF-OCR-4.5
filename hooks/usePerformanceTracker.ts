import { useState, useRef, useCallback, useEffect } from 'react';

// FIX: Define the shape of the API calls tracker.
export type ApiCallTracker = {
  flash: number;
  pro: number;
  total: number;
};

const initialApiCalls: ApiCallTracker = {
  flash: 0,
  pro: 0,
  total: 0,
};

export const usePerformanceTracker = () => {
  const [elapsedTime, setElapsedTime] = useState(0);
  // FIX: apiCalls is now an object to track calls by model type.
  const [apiCalls, setApiCalls] = useState<ApiCallTracker>(initialApiCalls);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  const startTimer = useCallback(() => {
    if (isRunning) return;
    // FIX: Correctly resume timer from the last elapsed time.
    startTimeRef.current = Date.now() - elapsedTime * 1000;
    setIsRunning(true);
  }, [isRunning, elapsedTime]);

  // FIX: stopTimer now just pauses the timer. The state is cumulative.
  const stopTimer = useCallback(() => {
    if (!isRunning) return;
    setIsRunning(false);
    // Update final elapsed time at the moment of stopping.
    setElapsedTime((Date.now() - startTimeRef.current) / 1000);
  }, [isRunning]);

  // FIX: resetTimer resets all cumulative states to their initial values.
  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setElapsedTime(0);
    setApiCalls(initialApiCalls);
  }, []);

  // FIX: incrementApiCalls now accepts the model name to track types.
  const incrementApiCalls = useCallback((modelName: string) => {
    setApiCalls(prev => {
      const type = modelName.toLowerCase().includes('pro') ? 'pro' : 'flash';
      return {
        ...prev,
        [type]: prev[type] + 1,
        total: prev.total + 1,
      };
    });
  }, []);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = window.setInterval(() => {
        setElapsedTime((Date.now() - startTimeRef.current) / 1000);
      }, 100);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  return {
    elapsedTime,
    apiCalls,
    isRunning,
    startTimer,
    stopTimer,
    resetTimer,
    incrementApiCalls,
  };
};
