
// Gemini counts tokens roughly as 1 token per 4 characters.
// Max Output Tokens = 8192 (~32,768 characters).
// SAFETY MARGIN: We need to ensure Input + Added Tags < 32,768.

const CHARS_PER_TOKEN_APPROX = 4;

// OPTIMIZATION v4.6 Turbo:
// Reduced from 28000 to 24000 to improve stability and prevent timeouts during Step 2 rewriting.
// 24000 chars ~= 6000 tokens, which allows safe processing within 2-3 minutes.
const MAX_OUTPUT_CHARS_SAFE = 24000;

// Step 3 is a rewrite/audit. Output ~= Input.
// We push this to 30,000 (very close to the 32k limit) to minimize chunks.
const MAX_OUTPUT_CHARS_STRICT = 30000;

// Cleaning REMOVES text (headers, footers, garbage). Output < Input.
// We can be VERY aggressive here. Inputting 80,000 chars often results in <30,000 chars of clean text.
// This allows processing ~30-40 pages in a SINGLE chunk.
const MAX_OUTPUT_CHARS_CLEANING = 80000;

/**
 * Splits a long text into smaller chunks while respecting paragraph boundaries.
 * Optimized to fill the buffer as much as possible without breaking the output limit.
 */
export const createChunks = (text: string, targetSizeChars: number): string[] => {
  if (text.length <= targetSizeChars) {
    return [text];
  }

  const paragraphs = text.split('\n\n');
  const chunks: string[] = [];
  let currentChunk = "";
  const SEPARATOR = '\n\n';

  for (const paragraph of paragraphs) {
    // If adding the next paragraph exceeds the limit (accounting for separator)...
    if (currentChunk.length + SEPARATOR.length + paragraph.length > targetSizeChars && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = "";
    }
    
    // Handle edge case: A single paragraph larger than the limit
    if (currentChunk.length === 0 && paragraph.length > targetSizeChars) {
        // Force split big paragraphs. 
        // CRITICAL FIX: Use [\s\S] instead of . to ensure newlines are preserved in big paragraphs.
        const forcedChunks = paragraph.match(new RegExp(`[\\s\\S]{1,${targetSizeChars}}`, 'g')) || [paragraph];
        chunks.push(...forcedChunks);
        continue;
    }

    if (currentChunk.length > 0) {
      currentChunk += SEPARATOR + paragraph;
    } else {
      currentChunk += paragraph;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
};

/**
 * Splits text into a specific number of chunks.
 */
export const createChunksByCount = (text: string, chunkCount: number): string[] => {
  if (chunkCount <= 1) return [text];
  const targetSize = Math.ceil(text.length / chunkCount);
  return createChunks(text, targetSize);
};

/**
 * Splits a document based on top-level headlines ({{level1}}).
 */
export const createChunksByTopLevelHeadline = (text: string): string[] => {
  const level1Regex = /({{level1}}.*?{{-level1}})/gs;
  const parts = text.split(level1Regex);
  
  const chunks: string[] = [];
  let preamble = parts[0] || '';
  
  for (let i = 1; i < parts.length; i += 2) {
    const headline = parts[i];
    const content = parts[i + 1] || '';
    const fullChunk = headline + content;
    
    if (chunks.length === 0) {
      chunks.push((preamble.trim() + '\n\n' + fullChunk.trim()).trim());
    } else {
      chunks.push(fullChunk.trim());
    }
  }
  
  if (chunks.length === 0 && text.trim().length > 0) {
    return [text];
  }

  return chunks;
};

/**
 * Groups chunks together until they reach a safe limit.
 * CRITICAL FIX: Now strictly enforces limits by splitting oversized individual chunks and accounting for separators.
 */
const groupSmallChunksSafe = (initialChunks: string[], maxChars: number): string[] => {
  if (initialChunks.length <= 1) return initialChunks;

  const result: string[] = [];
  let currentGroup = '';
  const SEPARATOR = '\n\n';

  for (const chunk of initialChunks) {
    // 1. Check if the single chunk ITSELF is too big.
    // If so, flush current group, then recursively split this big chunk and add its pieces.
    if (chunk.length >= maxChars) {
      if (currentGroup) {
        result.push(currentGroup);
        currentGroup = '';
      }
      const splitChunks = createChunks(chunk, maxChars);
      result.push(...splitChunks);
      continue;
    }

    // 2. Check if adding this chunk to the group exceeds limit (including separator).
    if (currentGroup && currentGroup.length + SEPARATOR.length + chunk.length > maxChars) {
      result.push(currentGroup);
      currentGroup = '';
    }

    currentGroup = currentGroup ? currentGroup + SEPARATOR + chunk : chunk;
  }

  if (currentGroup) {
    result.push(currentGroup);
  }
  return result;
};

// --- Step-Specific Strategies ---

/**
 * Strategy for Cleaning using Gemini Pro.
 * Optimized: 80,000 chars (~30 pages).
 */
export const getChunksForCleaning = (text: string): string[] => {
  return createChunks(text, MAX_OUTPUT_CHARS_CLEANING);
};

export const getChunksForStep1A = (text: string): string[] => {
  // Step 1 tags content. Input size ~= Output size (plus tags).
  // Optimized: 24,000 chars.
  return createChunks(text, MAX_OUTPUT_CHARS_SAFE);
};

/**
 * Step 2: Content Structure
 * Optimized: 24,000 chars.
 */
export const getChunksForStep2 = (text: string): string[] => {
  const initialChunks = createChunksByTopLevelHeadline(text);
  
  if (initialChunks.length === 1) {
    return createChunks(text, MAX_OUTPUT_CHARS_SAFE);
  }

  return groupSmallChunksSafe(initialChunks, MAX_OUTPUT_CHARS_SAFE);
};

/**
 * Step 3: Batch Fix / Structure Audit
 * Optimized: 30,000 chars.
 */
export const getChunksForStep3 = (text: string): string[] => {
  // Priority 1: Try to fit in one context call if small enough
  if (text.length <= MAX_OUTPUT_CHARS_STRICT) {
    return [text];
  }

  // Priority 2: Split by level1 and group intelligently
  const initialChunks = createChunksByTopLevelHeadline(text);
  
  if (initialChunks.length === 1) {
    return createChunks(text, MAX_OUTPUT_CHARS_STRICT);
  }

  return groupSmallChunksSafe(initialChunks, MAX_OUTPUT_CHARS_STRICT);
};
