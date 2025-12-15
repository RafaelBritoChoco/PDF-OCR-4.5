
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

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Define model constants
export const MODEL_FAST = "gemini-flash-lite-latest";
export const MODEL_STRICT = "gemini-3-pro-preview";

// Helper for delay
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Render a PDF page to Base64 (JPEG)
const renderPageToJpegBase64 = async (page: pdfjs.PDFPageProxy): Promise<string | null> => {
  const viewport = page.getViewport({ scale: 2.5 });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return null;

  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({ canvasContext: context, viewport } as any).promise;

  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  return dataUrl.split(",")[1];
};

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

/* =====================================================================================
   STEP 2 POST-VALIDATOR
   - Normaliza tags "computadas" (level2+1 -> level3)
   - Corrige text_level variantes e balanceamento básico
===================================================================================== */

const normalizeNewlines = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const fixComputedLevelTags = (s: string) => {
  // {{level2+1}} -> {{level3}}  and  {{-level2+1}} -> {{-level3}}
  return s.replace(/{{(-?)level(\d+)\s*\+\s*(\d+)}}/g, (_m, neg, a, b) => {
    const sum = Number(a) + Number(b);
    return `{{${neg ? "-" : ""}level${sum}}}`;
  });
};

const stripTextLevelVariants = (s: string) => {
  // remove/normalize invented tags like {{text_level1}}
  return s
    .replace(/{{text_level\d+}}/g, "{{text_level}}")
    .replace(/{{-text_level\d+}}/g, "{{-text_level}}");
};

const normalizeDuplicateLevelWrappersInLine = (line: string) => {
  // If a line contains multiple level opens/closes, normalize to one open + one close (same N)
  const opens = [...line.matchAll(/{{level(\d+)}}/g)];
  if (opens.length === 0) return line;

  const n = opens[0][1];
  let out = line;

  // remove all opens, reinsert first at original position
  const firstOpenIdx = opens[0].index ?? 0;
  out = out.replace(/{{level\d+}}/g, "");
  out = out.slice(0, firstOpenIdx) + `{{level${n}}}` + out.slice(firstOpenIdx);

  // remove all closes, append one close at end
  out = out.replace(/{{-level\d+}}/g, "");
  out = out + `{{-level${n}}}`;

  return out;
};

const extractLevelFromLine = (trimmed: string): number | null => {
  const m = trimmed.match(/^{{level(\d+)}}/);
  return m ? Number(m[1]) : null;
};

const startsWithQuote = (s: string): boolean => {
  const t = s.trim();
  return t.startsWith('"') || t.startsWith('“') || t.startsWith('”');
};

const stripTagsFromLine = (s: string): string => {
  return s.replace(/{{[^}]+}}/g, '').trim();
};

const isPureOpenTextLevel = (trimmed: string) => trimmed === "{{text_level}}";
const isPureCloseTextLevel = (trimmed: string) => trimmed === "{{-text_level}}";
const isFootnoteLine = (trimmed: string) => /^{{footnote\d+}}/.test(trimmed);
const isHeadlineOrContentLine = (trimmed: string) => /^{{level\d+}}/.test(trimmed);

/**
 * Heurística determinística para corrigir casos como:
 *   {{level2}}For the purposes of this Chapter:{{-level2}}
 *   {{level2}}“algorithm” means ...{{-level2}}
 * Aqui o segundo deveria ser filho => level3.
 */
export const fixLeadInDefinitionHierarchy = (text: string): string => {
  const lines = normalizeNewlines(text).split('\n');

  let inTextLevel = false;
  let leadLevel: number | null = null;

  const isLeadInSentence = (payload: string): boolean => {
    const t = payload.trim();
    if (!t.endsWith(':')) return false;
    if (startsWithQuote(t)) return false;
    if (t.startsWith('(')) return false;
    const low = t.toLowerCase();
    // keep this conservative: only known patterns
    return low.includes('for the purposes') || low.includes('for purposes') || low.includes('as follows');
  };

  const isSubItem = (payload: string): boolean => {
    const t = payload.trimStart();
    return /^\([a-z0-9]+\)/i.test(t);
  };

  const rewriteToLevel = (line: string, toLevel: number): string => {
    // Replace the wrapper level tags on the SAME line.
    return line
      .replace(/{{level\d+}}/, `{{level${toLevel}}}`)
      .replace(/{{-level\d+}}/, `{{-level${toLevel}}}`);
  };

  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '{{text_level}}') {
      inTextLevel = true;
      out.push(line);
      continue;
    }
    if (trimmed === '{{-text_level}}') {
      inTextLevel = false;
      leadLevel = null;
      out.push(line);
      continue;
    }

    if (!inTextLevel) {
      leadLevel = null;
      out.push(line);
      continue;
    }

    const lvl = extractLevelFromLine(line);
    const payload = stripTagsFromLine(line);

    // 1) Detect a REAL lead-in sentence (parent)
    if (lvl != null && isLeadInSentence(payload)) {
      leadLevel = lvl;
      out.push(line);
      continue;
    }

    // 2) If we are inside an active lead-in block, enforce:
    if (leadLevel != null && lvl != null) {
      // terminate when we return to same-or-higher level (new section/paragraph)
      if (lvl <= leadLevel && !isLeadInSentence(payload)) {
        leadLevel = null;
        out.push(line);
        continue;
      }

      if (startsWithQuote(payload)) {
        const target = leadLevel + 1;
        if (lvl != target) {
          out.push(rewriteToLevel(line, target));
          continue;
        }
      }

      if (isSubItem(payload)) {
        const target = leadLevel + 2;
        if (lvl != target) {
          out.push(rewriteToLevel(line, target));
          continue;
        }
      }
    }

    out.push(line);
  }

  return out.join('\n');
};

export const validateStructuralIntegrity = (text: string): string => {
  let s = normalizeNewlines(text);
  s = fixComputedLevelTags(s);
  s = stripTextLevelVariants(s);

  const rawLines = s.split("\n");

  const out: string[] = [];
  let textLevelOpen = false;
  let currentStructuralHeadlineLevel = 0; // last {{levelN}} seen OUTSIDE text_level (0 default)

  const pushCloseIfOpen = () => {
    if (textLevelOpen) {
      out.push("{{-text_level}}");
      textLevelOpen = false;
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];

    // sanitize computed/variant tags per-line too
    line = fixComputedLevelTags(line);
    line = stripTextLevelVariants(line);

    // normalize duplicated level wrappers (common hallucination)
    if (line.includes("{{level")) {
      line = normalizeDuplicateLevelWrappersInLine(line);
    }

    const trimmed = line.trim();

    // footnote blocks must not be *inside* text_level
    if (isFootnoteLine(trimmed)) {
      pushCloseIfOpen();
      out.push(line);
      continue;
    }

    // handle text_level open
    if (isPureOpenTextLevel(trimmed)) {
      if (textLevelOpen) continue; // no nesting
      if (currentStructuralHeadlineLevel === 0) continue; // never open under level0
      textLevelOpen = true;
      out.push("{{text_level}}");
      continue;
    }

    // handle text_level close
    if (isPureCloseTextLevel(trimmed)) {
      if (!textLevelOpen) continue;
      textLevelOpen = false;
      out.push("{{-text_level}}");
      continue;
    }

    // update structural headline tracker when OUTSIDE text_level
    if (!textLevelOpen && isHeadlineOrContentLine(trimmed)) {
      const lvl = extractLevelFromLine(trimmed);
      if (lvl !== null) currentStructuralHeadlineLevel = lvl;
      out.push(line);
      continue;
    }

    // if inside text_level and a structural headline shows up (level <= current headline), close before it
    if (textLevelOpen && isHeadlineOrContentLine(trimmed)) {
      const lvl = extractLevelFromLine(trimmed);
      if (lvl !== null && lvl <= currentStructuralHeadlineLevel) {
        out.push("{{-text_level}}");
        textLevelOpen = false;
        currentStructuralHeadlineLevel = lvl;
        out.push(line);
        continue;
      }
      out.push(line);
      continue;
    }

    // if we are OUTSIDE text_level and we see a content line (level > current headline), we should open text_level
    if (!textLevelOpen && isHeadlineOrContentLine(trimmed)) {
      const lvl = extractLevelFromLine(trimmed);
      if (lvl !== null && currentStructuralHeadlineLevel >= 1 && lvl > currentStructuralHeadlineLevel) {
        out.push("{{text_level}}");
        textLevelOpen = true;
        out.push(line);
        continue;
      }
    }

    // plain line
    out.push(line);
  }

  if (textLevelOpen) out.push("{{-text_level}}");

  // apply deterministic nesting fix
  return fixLeadInDefinitionHierarchy(out.join("\n"));
};

/* =====================================================================================
   STEP 3 GUARDRAIL
   - garante que Step 3 NÃO muda payload (só tags)
===================================================================================== */

const STEP3_ALLOWED_TAG = /^{{(-?)(level\d+|text_level|footnote\d+|footnotenumber\d+)}}$/;

const step3ExtractTagTokens = (s: string): string[] => s.match(/{{[^}]+}}/g) ?? [];

const step3HasForbiddenTags = (s: string): string[] => {
  const tokens = step3ExtractTagTokens(s);
  const bad: string[] = [];
  for (const t of tokens) {
    if (/^{{-?text_level\d+}}$/.test(t)) {
      bad.push(t);
      continue;
    }
    // forbid computed level forms like {{level2+1}}
    if (/^{{-?level\d+\s*\+\s*\d+}}$/.test(t)) {
      bad.push(t);
      continue;
    }
    if (!STEP3_ALLOWED_TAG.test(t)) bad.push(t);
  }
  return bad;
};

const step3Count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const step3PayloadLines = (s: string): string[] => {
  const lines = normalizeNewlines(s).split("\n");
  const payload: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Step 3 pode mover essas linhas, então ignoramos no check de imutabilidade
    if (trimmed === "{{text_level}}" || trimmed === "{{-text_level}}") continue;

    const withoutTags = line
      .replace(/{{-?level\d+}}/g, "")
      .replace(/{{-?footnote\d+}}/g, "")
      .replace(/{{-?footnotenumber\d+}}/g, "")
      .replace(/{{-?text_level}}/g, "") // defensivo
      .replace(/{{-?text_level\d+}}/g, ""); // defensivo (deveria ser proibido antes)

    payload.push(withoutTags);
  }

  return payload;
};

export const guardStep3ConservativeOutput = (
  before: string,
  after: string
): { text: string; issues: string[] } => {
  const issues: string[] = [];

  const b = normalizeNewlines(before);
  // also run deterministic nesting fix on the proposed output so Step 3 can "auto-correct" hierarchy
  const a = fixLeadInDefinitionHierarchy(normalizeNewlines(after));

  // 1) Forbidden / invented tags
  const badTags = step3HasForbiddenTags(a);
  if (badTags.length) {
    issues.push(`Forbidden tags detected: ${badTags.slice(0, 10).join(", ")}`);
    return { text: before, issues };
  }

  // 2) If input had text_level blocks, output must still have them and be balanced
  const bOpen = step3Count(b, /{{text_level}}/g);
  const bClose = step3Count(b, /{{-text_level}}/g);
  const aOpen = step3Count(a, /{{text_level}}/g);
  const aClose = step3Count(a, /{{-text_level}}/g);

  if (bOpen > 0 || bClose > 0) {
    if (aOpen === 0 || aClose === 0) {
      issues.push("text_level blocks disappeared in Step 3 output.");
      return { text: before, issues };
    }
    if (aOpen !== aClose) {
      issues.push(`Unbalanced text_level in Step 3 output: open=${aOpen} close=${aClose}`);
      return { text: before, issues };
    }
  }

  // 3) Headline wrappers must remain (count of level tags must match)
  const bLevelOpen = step3Count(b, /{{level\d+}}/g);
  const bLevelClose = step3Count(b, /{{-level\d+}}/g);
  const aLevelOpen = step3Count(a, /{{level\d+}}/g);
  const aLevelClose = step3Count(a, /{{-level\d+}}/g);

  if (bLevelOpen !== aLevelOpen || bLevelClose !== aLevelClose) {
    issues.push(`level tag count changed (open ${bLevelOpen}->${aLevelOpen}, close ${bLevelClose}->${aLevelClose}).`);
    return { text: before, issues };
  }

  // 4) Footnote wrappers must remain (count must match)
  const bFn = step3Count(b, /{{footnote\d+}}/g);
  const aFn = step3Count(a, /{{footnote\d+}}/g);
  const bFnNum = step3Count(b, /{{footnotenumber\d+}}/g);
  const aFnNum = step3Count(a, /{{footnotenumber\d+}}/g);

  if (bFn !== aFn || bFnNum !== aFnNum) {
    issues.push(`footnote tag count changed (footnote ${bFn}->${aFn}, footnotenumber ${bFnNum}->${aFnNum}).`);
    return { text: before, issues };
  }

  // 5) Text immutability check (payload lines must match exactly)
  const beforePayload = step3PayloadLines(b);
  const afterPayload = step3PayloadLines(a);

  if (beforePayload.length !== afterPayload.length) {
    issues.push(`payload line count changed (${beforePayload.length} -> ${afterPayload.length}).`);
    return { text: before, issues };
  }

  for (let i = 0; i < beforePayload.length; i++) {
    if (beforePayload[i] !== afterPayload[i]) {
      issues.push(`payload text changed at line index ${i}.`);
      return { text: before, issues };
    }
  }

  return { text: a, issues };
};

// Re-export needed functions for App.tsx
export { 
    guardStep2ContentIntegrity, 
    convertShortTagsToFullStructure 
} from "./processors/structureUtils"; // Placeholder if you still have the file, otherwise remove export or define dummys
