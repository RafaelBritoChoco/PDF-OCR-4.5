
export enum ProcessingState {
  IDLE = 'IDLE',
  ANALYZING_PDF = 'ANALYZING_PDF',
  AWAITING_COMPARISON_FILE = 'AWAITING_COMPARISON_FILE',
  AWAITING_TXT_ACTION = 'AWAITING_TXT_ACTION',
  COMPARING_TEXT = 'COMPARING_TEXT',
  PROCESSING_HYBRID_PDF = 'PROCESSING_HYBRID_PDF',
  CONFIGURING_CLEANING = 'CONFIGURING_CLEANING',
  CONFIGURING_HEADLINES = 'CONFIGURING_HEADLINES',
  CONFIGURING_CONTENT = 'CONFIGURING_CONTENT',
  REVIEWING_OCR = 'REVIEWING_OCR',
  REVIEWING_JSON = 'REVIEWING_JSON',
  REVIEWING_CHANGES = 'REVIEWING_CHANGES',
  REVIEWING_STEP3_FINAL = 'REVIEWING_STEP3_FINAL',
  EXTRACTING = 'EXTRACTING',
  OCR = 'OCR',
  TRANSFORMING_JSON = 'TRANSFORMING_JSON',
  CLEANING = 'CLEANING',
  STRUCTURING_HEADLINES = 'STRUCTURING_HEADLINES',
  STRUCTURING_FOOTNOTES = 'STRUCTURING_FOOTNOTES',
  STRUCTURING_CONTENT = 'STRUCTURING_CONTENT',
  AUDITING_STRUCTURE = 'AUDITING_STRUCTURE',
  TABLE_LINEARIZING = 'TABLE_LINEARIZING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR',
}

export enum ProcessingMode {
  FAST = 'FAST',
  QUALITY = 'QUALITY',
}

export type OcrPage = {
  ocrText: string;
  imageBase64: string;
};

export type SelectedSteps = {
  step1: boolean;
  step1_5: boolean;
  step2: boolean;
  step3: boolean;
};

export type ExtractionStats = {
    method: 'Native Text' | 'OCR (All Pages)' | 'Hybrid (Text + OCR)';
    totalPages: number;
    textPages: number;
    imagePages: number;
    averageCharsPerPage: number;
};

export type ChatEntry = {
    id: string;
    role: 'user' | 'ai';
    message: string;
    proposedText?: string; // If the AI suggests a fix
    applied?: boolean; // If the fix was applied
    timestamp: number;
};
