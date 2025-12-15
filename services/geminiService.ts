
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import * as pdfjs from "pdfjs-dist";
import { ProcessingMode, OcrPage } from "../types";
import { loadPdfDocument } from "./pdfExtractor";
import {
  getOcrPromptForLanguage,
  getTaskInstructionsForLanguageDetection,
  getTaskInstructionsForTextComparison,
  getTaskInstructionsForJsonTransform,
  getTableLinearizationPrompt,
  getTaskInstructionsForSpecificRefinement,
  getTaskInstructionsForConversationalRefinement,
} from "./promptRegistry";

// Import processors to keep this file clean
import { renderPageToJpegBase64 } from "./processors/imageUtils";

// Re-export structural validators so App.tsx can import them from here
export { 
  validateStructuralIntegrity,
  guardStep3ConservativeOutput,
  guardStep2ContentIntegrity,
  convertShortTagsToFullStructure
} from "./processors/structureUtils";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Define model constants
export const MODEL_FAST = "gemini-flash-lite-latest";
export const MODEL_STRICT = "gemini-3-pro-preview";

// Helper for delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// --- REAL TIMEOUT IMPLEMENTATION ---
const timeoutPromise = <T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      const id = setTimeout(() => {
        clearTimeout(id);
        reject(new Error(errorMessage));
      }, ms);
    }),
  ]);
};

// Increased timeouts
const DEFAULT_TIMEOUT_MS = 90_000;
const PRO_TIMEOUT_MS = 480_000;

/* =====================================================================================
   OCR
===================================================================================== */

export const performOcrOnPdf = async (
  file: File,
  onApiCall: (model: string) => void,
  mode: ProcessingMode,
  language: string,
  onProgress: (progress: number) => void,
  onLog?: (message: string) => void
): Promise<OcrPage[]> => {
  const pdfDocument = await loadPdfDocument(file);
  const numPages = pdfDocument.numPages;

  const model = MODEL_FAST;
  const config = {};
  const pageResults: OcrPage[] = [];

  for (let i = 1; i <= numPages; i++) {
    const pageNumber = i;
    onLog?.(`Processando página ${pageNumber} de ${numPages}...`);
    const page = await pdfDocument.getPage(pageNumber);

    try {
      const base64Data = await renderPageToJpegBase64(page);
      if (!base64Data) {
        pageResults.push({ ocrText: "", imageBase64: "" });
        continue;
      }

      const imagePart = { inlineData: { mimeType: "image/jpeg", data: base64Data } };
      const textPart = { text: getOcrPromptForLanguage(language) };

      let retries = 3;
      let success = false;
      let textResult = "";

      while (retries > 0 && !success) {
        try {
          onApiCall(model);
          const response: GenerateContentResponse = await timeoutPromise(
            ai.models.generateContent({
              model,
              contents: { parts: [imagePart, textPart] },
              config,
            }),
            DEFAULT_TIMEOUT_MS,
            "TIMEOUT_OCR"
          );

          textResult = response.text ?? "";
          success = true;
        } catch (err: any) {
          const isTimeout = err.message?.includes("TIMEOUT");
          const isRateLimit = err.status === 429 || err.message?.includes("429");
          const isInternal = err.message?.includes("500") || err.message?.includes("Internal error") || err.status === 500;

          if ((isInternal || isTimeout || isRateLimit) && retries > 1) {
            const waitTime = isRateLimit ? 5000 * (4 - retries) : 2000 * (4 - retries);
            await delay(waitTime);
            retries--;
            onLog?.(`Retrying page ${pageNumber} due to ${isRateLimit ? "Quota Limit (429)" : "Error"}...`);
          } else {
            throw err;
          }
        }
      }

      pageResults.push({ ocrText: textResult, imageBase64: base64Data });
      onLog?.(`✓ Página ${pageNumber} processada.`);
    } catch (error) {
      console.error(`Error processing page ${pageNumber}`, error);
      pageResults.push({ ocrText: `[ERROR: Could not process page ${pageNumber}]`, imageBase64: "" });
    } finally {
      page.cleanup();
      onProgress(Math.round((pageNumber / numPages) * 100));
    }
  }

  return pageResults;
};

export const extractTextWithOcr = async (
  file: File,
  onApiCall: (model: string) => void,
  mode: ProcessingMode,
  language: string,
  onProgress: (progress: number) => void,
  onLog?: (message: string) => void
): Promise<string> => {
  const ocrPages = await performOcrOnPdf(file, onApiCall, mode, language, onProgress, onLog);
  if (ocrPages.some((p) => p.ocrText.startsWith("[ERROR"))) {
    throw new Error("Falha no OCR de algumas páginas.");
  }
  return ocrPages.map((p) => p.ocrText).join("\n\n--- PAGE BREAK ---\n\n");
};

export const performOcrOnPageTextOnly = async (
  page: pdfjs.PDFPageProxy,
  language: string,
  mode: ProcessingMode,
  onApiCall: (model: string) => void
): Promise<string> => {
  try {
    const base64Data = await renderPageToJpegBase64(page);
    if (!base64Data) return `[ERROR: Could not render page.]`;

    const modelName = MODEL_FAST;
    onApiCall(modelName);

    const response: GenerateContentResponse = await timeoutPromise(
      ai.models.generateContent({
        model: modelName,
        contents: {
          parts: [
            { inlineData: { mimeType: "image/jpeg", data: base64Data } },
            { text: getOcrPromptForLanguage(language) },
          ],
        },
      }),
      DEFAULT_TIMEOUT_MS,
      "TIMEOUT_PAGE_OCR"
    );

    return response.text ?? "";
  } catch {
    return `[ERROR: Could not process page with OCR.]`;
  }
};

/* =====================================================================================
   CHUNK PROCESSING / STEPS
===================================================================================== */

interface ProcessChunkOptions {
  main_chunk_content: string;
  continuous_context_summary: string;
  previous_chunk_overlap: string;
  next_chunk_overlap: string;
  task_instructions: string;
  onApiCall: (model: string) => void;
  mode: ProcessingMode;
  language: string;
  model?: string;
  onLog?: (message: string) => void;
  timeoutMs?: number;
  validator?: (input: string, output: string) => void;
}

export const processDocumentChunk = async (options: ProcessChunkOptions): Promise<string> => {
  const {
    main_chunk_content,
    continuous_context_summary,
    previous_chunk_overlap,
    next_chunk_overlap,
    task_instructions,
    onApiCall,
    language,
    model: modelOverride,
    validator,
    onLog
  } = options;

  const model = modelOverride || MODEL_FAST;
  const isStrictModel = model === MODEL_STRICT;
  const config: any = isStrictModel ? { temperature: 0, topK: 1, topP: 0 } : {};
  const currentTimeout = model.includes("pro") ? PRO_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

  const createPrompt = (chunkContent: string) => `
**DOCUMENT LANGUAGE: ${language}**
**CONTEXT SUMMARY:** ${continuous_context_summary}
**TASK INSTRUCTIONS:** ${task_instructions}

**DOCUMENT CHUNK TO PROCESS:**
---
[START PREVIOUS CHUNK OVERLAP]
${previous_chunk_overlap || "N/A"}
[END PREVIOUS CHUNK OVERLAP]
---
[START MAIN CHUNK CONTENT]
${chunkContent}
[END MAIN CHUNK CONTENT]
---
[START NEXT CHUNK OVERLAP]
${next_chunk_overlap || "N/A"}
[END NEXT CHUNK OVERLAP]
---
Process ONLY the [MAIN CHUNK CONTENT]. Return ONLY the result.
`;

  const MAX_RETRIES = 5;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 1) {
          onLog?.(`Retry attempt ${attempt}/${MAX_RETRIES}...`);
      }
      onApiCall(model);
      const response: GenerateContentResponse = await timeoutPromise(
        ai.models.generateContent({ model, contents: createPrompt(main_chunk_content), config }),
        currentTimeout,
        "TIMEOUT_CHUNK_PROCESSING"
      );
      
      const resultText = response.text ?? "";

      // INTERNAL VALIDATION
      if (validator) {
          try {
              validator(main_chunk_content, resultText);
          } catch (validationError: any) {
              onLog?.(`⚠️ Output validation failed: ${validationError.message}. Retrying...`);
              throw new Error(`VALIDATION_FAILED: ${validationError.message}`);
          }
      }

      return resultText;
    } catch (error: any) {
      const isTimeout = error.message?.includes("TIMEOUT");
      const isRateLimit = error.status === 429 || error.message?.includes("429");
      const isValidationFailed = error.message?.includes("VALIDATION_FAILED");
      const isInternalError =
        error.message?.includes("500") ||
        error.message?.includes("Internal error") ||
        error.message?.includes("Server") ||
        error.status === 500 ||
        error.status === 503;

      if (isInternalError || isTimeout || isRateLimit || isValidationFailed) {
        if (attempt < MAX_RETRIES) {
          const baseDelay = isRateLimit ? 5000 : 2000;
          const delayMs = baseDelay * Math.pow(2, attempt - 1) + Math.random() * 500;
          await delay(delayMs);
          continue;
        }
        return `[ERROR: Failed after ${MAX_RETRIES} attempts. Reason: ${error.message}]`;
      }
      throw error;
    }
  }

  return `[ERROR: Failed after ${MAX_RETRIES} attempts.]`;
};

/* =====================================================================================
   UTILITIES
===================================================================================== */

export const detectDocumentLanguage = async (
  textSnippet: string,
  supportedLanguages: string[],
  onApiCall: (model: string) => void
): Promise<string> => {
  const model = MODEL_FAST;
  const config = {};
  const prompt = getTaskInstructionsForLanguageDetection(supportedLanguages).replace(
    "[TEXT_SNIPPET_HERE]",
    textSnippet.substring(0, 2000)
  );

  onApiCall(model);
  try {
    const response: GenerateContentResponse = await timeoutPromise(
      ai.models.generateContent({ model, contents: prompt, config }),
      DEFAULT_TIMEOUT_MS,
      "TIMEOUT_LANG_DETECT"
    );
    const detectedLang = response.text?.trim() ?? "";
    return supportedLanguages.includes(detectedLang) ? detectedLang : "";
  } catch {
    return "";
  }
};

export const transformJsonToText = async (jsonString: string, onApiCall: (model: string) => void): Promise<string> => {
  const model = MODEL_FAST;
  const config = {};
  const prompt = getTaskInstructionsForJsonTransform().replace("[JSON_STRING_HERE]", jsonString);

  try {
    onApiCall(model);
    const response: GenerateContentResponse = await timeoutPromise(
      ai.models.generateContent({ model, contents: prompt, config }),
      DEFAULT_TIMEOUT_MS,
      "TIMEOUT_JSON_TRANSFORM"
    );
    return response.text ?? "";
  } catch (error: any) {
    return `[ERROR: ${error.message}]`;
  }
};

// Helper: split text into chunks
const splitTextIntoChunks = (text: string, chunkSize: number): string[] => {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.substring(i, Math.min(i + chunkSize, text.length)));
  }
  return chunks;
};

export const compareAndCorrectText = async (
  userText: string,
  referenceOcrText: string,
  onApiCall: (model: string) => void,
  mode: ProcessingMode,
  language: string
): Promise<string> => {
  const model = MODEL_STRICT;
  const config = { temperature: 0 };

  const USER_CHUNK_SIZE = 4000;
  const userChunks = splitTextIntoChunks(userText, USER_CHUNK_SIZE);

  let processedText = "";
  const totalUserLen = userText.length;
  const totalRefLen = referenceOcrText.length;
  const ratio = totalRefLen / (totalUserLen || 1);
  const PADDING = 1000;

  for (let i = 0; i < userChunks.length; i++) {
    const chunkStart = i * USER_CHUNK_SIZE;
    const chunkEnd = chunkStart + userChunks[i].length;

    const refStart = Math.max(0, Math.floor(chunkStart * ratio) - PADDING);
    const refEnd = Math.min(totalRefLen, Math.floor(chunkEnd * ratio) + PADDING);

    const referenceChunk = referenceOcrText.substring(refStart, refEnd);
    const userChunk = userChunks[i];

    const prompt = getTaskInstructionsForTextComparison(language)
      .replace("{user_text_here}", userChunk)
      .replace("{ocr_text_here}", referenceChunk);

    let retries = 3;
    let chunkResult = "";

    while (retries > 0 && !chunkResult) {
      try {
        onApiCall(model);
        const response: GenerateContentResponse = await timeoutPromise(
          ai.models.generateContent({ model, contents: prompt, config } as any),
          PRO_TIMEOUT_MS,
          "TIMEOUT_COMPARISON"
        );

        chunkResult = response.text ?? "";
        if (!chunkResult) throw new Error("Empty response from AI");
      } catch (error: any) {
        const isTimeout = error.message?.includes("TIMEOUT");
        const isRateLimit = error.status === 429 || error.message?.includes("429");
        const isInternal =
          error.message?.includes("500") || error.message?.includes("Internal error") || error.status === 500;

        if ((isInternal || isTimeout || isRateLimit) && retries > 1) {
          const waitTime = isRateLimit ? 5000 * (4 - retries) : 3000 * (4 - retries);
          await delay(waitTime);
          retries--;
          continue;
        }

        chunkResult = userChunk + "\n// [ERROR: Comparison failed for this block]\n";
        console.error("Chunk comparison error:", error);
      }
    }

    processedText += (i > 0 ? "\n" : "") + chunkResult.trim();
  }

  return processedText;
};

export const refineStructureWithInstruction = async (
  currentText: string,
  instruction: string,
  referenceText: string,
  language: string,
  onApiCall: (model: string) => void
): Promise<string> => {
  const model = MODEL_STRICT;
  const config = { temperature: 0 };
  const prompt =
    getTaskInstructionsForSpecificRefinement(language, instruction, referenceText) +
    `\n\n--- TEXT TO EDIT ---\n${currentText}`;

  onApiCall(model);
  try {
    const response: GenerateContentResponse = await timeoutPromise(
      ai.models.generateContent({ model, contents: prompt, config } as any),
      PRO_TIMEOUT_MS,
      "TIMEOUT_REFINEMENT"
    );
    return response.text ?? currentText;
  } catch (error: any) {
    console.error("Refinement error:", error);
    throw new Error(`Refinement failed: ${error.message}`);
  }
};

export const chatAboutRefinement = async (
  currentText: string,
  userMessage: string,
  referenceText: string,
  language: string,
  onApiCall: (model: string) => void,
  useProModel: boolean = true, 
  imageBase64?: string
): Promise<{ reply: string; refinedText?: string }> => {
  const model = useProModel ? MODEL_STRICT : MODEL_FAST;
  const config = { responseMimeType: "application/json", temperature: 0 };
  
  const textPrompt =
    getTaskInstructionsForConversationalRefinement(language, userMessage, referenceText) +
    `${currentText}\n[TEXT_END]`;

  const contents: any = { parts: [] };
  if (imageBase64) {
      contents.parts.push({ inlineData: { mimeType: 'image/jpeg', data: imageBase64 } });
  }
  contents.parts.push({ text: textPrompt });

  try {
    onApiCall(model);
    const response: GenerateContentResponse = await timeoutPromise(
      ai.models.generateContent({ model, contents, config } as any),
      PRO_TIMEOUT_MS,
      "TIMEOUT_CHAT_REFINEMENT"
    );

    const rawText = response.text || "{}";
    const json = JSON.parse(rawText);

    return {
      reply: json.reply || "Processed.",
      refinedText: json.refined_text || undefined,
    };
  } catch (error: any) {
    console.error("Chat Refinement error:", error);
    return { reply: "Sorry, I encountered an error processing your request." };
  }
};

export const linearizeTableFromPdf = async (
  file: File,
  onApiCall: (model: string) => void,
  onProgress: (progress: { stage: string; percentage: number }) => void
): Promise<string> => {
  const pdfDocument = await loadPdfDocument(file);
  const numPages = pdfDocument.numPages;
  onProgress({ stage: "Loading PDF...", percentage: 0 });

  const model = MODEL_FAST;
  const imageParts: any[] = [];

  for (let i = 1; i <= numPages; i++) {
    onProgress({ stage: `Rendering page ${i}/${numPages}...`, percentage: Math.round((i / numPages) * 50) });
    const page = await pdfDocument.getPage(i);
    const base64Data = await renderPageToJpegBase64(page);
    page.cleanup();
    if (base64Data) imageParts.push({ inlineData: { mimeType: "image/jpeg", data: base64Data } });
  }

  if (imageParts.length === 0) throw new Error("No pages rendered.");

  onProgress({ stage: "AI Table Linearization...", percentage: 75 });

  let retries = 3;
  while (retries > 0) {
    try {
      onApiCall(model);
      const response: GenerateContentResponse = await timeoutPromise(
        ai.models.generateContent({
          model,
          contents: { parts: [{ text: getTableLinearizationPrompt() }, ...imageParts] },
        } as any),
        PRO_TIMEOUT_MS,
        "TIMEOUT_TABLE_LINEARIZATION"
      );
      onProgress({ stage: "Done", percentage: 100 });
      return response.text ?? "";
    } catch (error: any) {
      const isTimeout = error.message?.includes("TIMEOUT");
      const isRateLimit = error.status === 429 || error.message?.includes("429");
      const isInternal = error.message?.includes("500") || error.status === 500;
      if ((isInternal || isTimeout || isRateLimit) && retries > 1) {
        await delay(isRateLimit ? 5000 : 3000);
        retries--;
        continue;
      }
      return `[ERROR: ${error.message}]`;
    }
  }

  return "[ERROR: Failed after retries.]";
};
