
/* =====================================================================================
   STRUCTURE UTILS
   Pure functions for validating, converting, and guarding text structures.
===================================================================================== */

const normalizeNewlines = (s: string) => s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const normalizeForComparison = (s: string) => s.replace(/\s+/g, '').trim();

/* --- Internal Helpers --- */

const fixComputedLevelTags = (s: string) => {
  // {{level2+1}} -> {{level3}}
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
 * Validates that Step 2 output (>>>H1 Title) matches Input (Title) exactly in content.
 * Throws error if mismatch is found.
 */
export const guardStep2ContentIntegrity = (input: string, output: string) => {
    const inputLines = input.split('\n').filter(l => l.trim().length > 0);
    const outputLines = output.split('\n').filter(l => l.trim().length > 0);

    // 1. Line Count Sanity Check
    if (outputLines.length < inputLines.length * 0.8) {
        throw new Error(`Line count mismatch: Input ${inputLines.length}, Output ${outputLines.length}`);
    }

    // 2. Content Mismatch Check
    const stripPrefix = (l: string) => l.replace(/^>>>[A-Z0-9]{2}\s?/, '');

    let mismatchCount = 0;
    const maxLines = Math.min(inputLines.length, outputLines.length);
    
    for(let i=0; i<maxLines; i++) {
        const inp = normalizeForComparison(inputLines[i]);
        const out = normalizeForComparison(stripPrefix(outputLines[i]));
        if (inp !== out) {
            mismatchCount++;
        }
    }
    
    // Fail if > 10% mismatch
    if (mismatchCount > maxLines * 0.1) {
        throw new Error(`Severe content mismatch in ${mismatchCount} lines.`);
    }
};

/**
 * Transforms ">>>H1 Title" into "{{level1}}Title{{-level1}}"
 * Aggressively cleans existing tags to prevent double-tagging.
 */
export const convertShortTagsToFullStructure = (text: string): string => {
  const lines = text.split('\n');
  const outLines: string[] = [];
  let inTextLevel = false;

  const openTextLevel = () => {
    if (!inTextLevel) {
      outLines.push('{{text_level}}');
      inTextLevel = true;
    }
  };

  const closeTextLevel = () => {
    if (inTextLevel) {
      outLines.push('{{-text_level}}');
      inTextLevel = false;
    }
  };

  const stripExistingTags = (s: string) => {
      return s
        .replace(/{{-?level\d+}}/g, '')
        .replace(/{{-?text_level}}/g, '')
        .replace(/{{-?footnote\d+}}/g, '')
        .replace(/{{-?footnotenumber\d+}}/g, '')
        .trim();
  };

  for (let line of lines) {
    line = line.trimEnd(); 
    const trimmed = line.trim();

    if (!trimmed) {
      outLines.push(line);
      continue;
    }

    // PREFIX HANDLERS
    const hMatch = line.match(/^>>>H(\d)\s?(.*)$/);
    if (hMatch) {
      const level = hMatch[1];
      const rawContent = hMatch[2];
      const content = stripExistingTags(rawContent);
      closeTextLevel(); 
      outLines.push(`{{level${level}}}${content}{{-level${level}}}`);
      continue;
    }

    let content = "";
    let isBodyType = false;
    
    if (line.startsWith('>>>TX')) {
      content = line.replace(/^>>>TX\s?/, '');
      isBodyType = true;
    } else if (line.startsWith('>>>LI')) {
      content = line.replace(/^>>>LI\s?/, '');
      isBodyType = true;
    } else if (line.startsWith('>>>QT')) {
      content = line.replace(/^>>>QT\s?/, '');
      isBodyType = true;
    }

    if (isBodyType) {
      content = stripExistingTags(content);
      openTextLevel();
      outLines.push(content);
      continue;
    }

    // Fallback
    const safeLine = stripExistingTags(line);
    openTextLevel();
    outLines.push(safeLine);
  }

  closeTextLevel();
  return outLines.join('\n');
};

/**
 * Heurística GENÉRICA para corrigir hierarquia de definições.
 */
export const fixLeadInDefinitionHierarchy = (text: string): string => {
  const lines = normalizeNewlines(text).split('\n');
  let inTextLevel = false;
  let leadLevel: number | null = null;

  const isLikelyLeadIn = (payload: string): boolean => {
    const t = payload.trim();
    if (!t.endsWith(':')) return false;
    if (startsWithQuote(t)) return false;
    if (/^\([a-z0-9]+\)/i.test(t)) return false;
    return true;
  };

  const isSubItem = (payload: string): boolean => {
    const t = payload.trimStart();
    return /^\([a-z0-9]+\)/i.test(t);
  };

  const rewriteToLevel = (line: string, toLevel: number): string => {
    return line
      .replace(/{{level\d+}}/, `{{level${toLevel}}}`)
      .replace(/{{-level\d+}}/, `{{-level${toLevel}}}`);
  };

  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '{{text_level}}') { inTextLevel = true; out.push(line); continue; }
    if (trimmed === '{{-text_level}}') { inTextLevel = false; leadLevel = null; out.push(line); continue; }

    if (!inTextLevel) {
      leadLevel = null;
      out.push(line);
      continue;
    }

    const lvl = extractLevelFromLine(line);
    const payload = stripTagsFromLine(line);

    if (lvl != null && isLikelyLeadIn(payload)) {
      leadLevel = lvl;
      out.push(line);
      continue;
    }

    if (leadLevel != null && lvl != null) {
      const isQuote = startsWithQuote(payload);
      if (isQuote) {
        if (lvl === leadLevel) { out.push(rewriteToLevel(line, leadLevel + 1)); continue; }
      } 
      else if (isSubItem(payload)) {
         const target = leadLevel + 2;
         if (lvl < target) { out.push(rewriteToLevel(line, target)); continue; }
      }
      else {
          if (lvl <= leadLevel) { leadLevel = null; }
      }
    }
    
    out.push(line);
  }
  return out.join('\n');
};

/**
 * Validates structural integrity, fixing dead branches and logical errors.
 */
export const validateStructuralIntegrity = (text: string): string => {
  let s = normalizeNewlines(text);
  s = fixComputedLevelTags(s);
  s = stripTextLevelVariants(s);

  const rawLines = s.split("\n");
  const out: string[] = [];
  let textLevelOpen = false;
  let currentStructuralHeadlineLevel = 0;

  const pushCloseIfOpen = () => {
    if (textLevelOpen) {
      out.push("{{-text_level}}");
      textLevelOpen = false;
    }
  };

  for (let i = 0; i < rawLines.length; i++) {
    let line = rawLines[i];
    line = fixComputedLevelTags(line);
    line = stripTextLevelVariants(line);
    const trimmed = line.trim();

    // 1. Footnotes break out of text_level
    if (isFootnoteLine(trimmed)) {
      pushCloseIfOpen();
      out.push(line);
      continue;
    }

    // 2. Explicit text_level markers
    if (isPureOpenTextLevel(trimmed)) {
      if (!textLevelOpen && currentStructuralHeadlineLevel > 0) {
        textLevelOpen = true;
        out.push("{{text_level}}");
      }
      continue; // consume input line
    }
    if (isPureCloseTextLevel(trimmed)) {
      pushCloseIfOpen();
      continue; // consume input line
    }

    // 3. Headline/Content Logic (Fixed Branching)
    if (isHeadlineOrContentLine(trimmed)) {
        const lvl = extractLevelFromLine(trimmed);
        if (lvl !== null) {
            // Case A: Structural Headline (Level <= Current Parent)
            if (lvl <= currentStructuralHeadlineLevel) {
                pushCloseIfOpen();
                currentStructuralHeadlineLevel = lvl;
                out.push(line);
                continue;
            }
            
            // Case B: Content Headline (Level > Current Parent)
            if (lvl > currentStructuralHeadlineLevel) {
                if (!textLevelOpen) {
                    out.push("{{text_level}}");
                    textLevelOpen = true;
                }
                out.push(line);
                continue;
            }
        }
    }

    // 4. Fallback for plain text
    if (!textLevelOpen && trimmed.length > 0) {
         if (currentStructuralHeadlineLevel > 0) {
             out.push("{{text_level}}");
             textLevelOpen = true;
         }
    }

    out.push(line);
  }

  pushCloseIfOpen();
  return fixLeadInDefinitionHierarchy(out.join("\n"));
};

/* --- Step 3 Guardrail Logic --- */

const STEP3_ALLOWED_TAG = /^{{(-?)(level\d+|text_level|footnote\d+|footnotenumber\d+)}}$/;

const step3ExtractTagTokens = (s: string): string[] => s.match(/{{[^}]+}}/g) ?? [];

const step3HasForbiddenTags = (s: string): string[] => {
  const tokens = step3ExtractTagTokens(s);
  const bad: string[] = [];
  for (const t of tokens) {
    if (/^{{-?text_level\d+}}$/.test(t)) { bad.push(t); continue; }
    if (/^{{-?level\d+\s*\+\s*\d+}}$/.test(t)) { bad.push(t); continue; }
    if (!STEP3_ALLOWED_TAG.test(t)) bad.push(t);
  }
  return bad;
};

const step3Count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

const step3PayloadLines = (s: string): string[] => {
  const lines = normalizeNewlines(s).split('\n');
  const payload: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '{{text_level}}' || trimmed === '{{-text_level}}') continue;
    const noTags = line
      .replace(/{{-?level\d+}}/g, '')
      .replace(/{{-?footnote\d+}}/g, '')
      .replace(/{{-?footnotenumber\d+}}/g, '')
      .replace(/{{-?text_level\d*}}/g, '')
      .trim();
    payload.push(noTags);
  }
  return payload;
};

// Helper for metadata extraction
type LineMeta = {
  levelOpen: number | null;
  inTextLevel: boolean;
};

const step3GetLineMetadata = (s: string): LineMeta[] => {
  const lines = normalizeNewlines(s).split('\n');
  const meta: LineMeta[] = [];
  let inTextLevel = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '{{text_level}}') {
      inTextLevel = true;
      continue;
    }
    if (trimmed === '{{-text_level}}') {
      inTextLevel = false;
      continue;
    }
    const m = trimmed.match(/^{{level(\d+)}}/);
    const levelOpen = m ? parseInt(m[1], 10) : null;
    meta.push({ levelOpen, inTextLevel });
  }
  return meta;
};

export const guardStep3ConservativeOutput = (
  before: string,
  after: string
): { text: string; issues: string[] } => {
  const issues: string[] = [];
  const b = normalizeNewlines(before);
  const a = fixLeadInDefinitionHierarchy(normalizeNewlines(after));

  // 1) Forbidden tags
  const badTags = step3HasForbiddenTags(a);
  if (badTags.length) {
    issues.push(`Forbidden tags: ${badTags.slice(0, 10).join(", ")}`);
    return { text: before, issues };
  }

  // 2) Balance text_level
  const bOpen = step3Count(b, /{{text_level}}/g);
  const aOpen = step3Count(a, /{{text_level}}/g);
  const aClose = step3Count(a, /{{-text_level}}/g);

  if (bOpen > 0 && aOpen === 0) {
      issues.push("text_level blocks disappeared.");
      return { text: before, issues };
  }
  if (aOpen !== aClose) {
      issues.push(`Unbalanced text_level: open=${aOpen} close=${aClose}`);
      return { text: before, issues };
  }

  // 3) Payload check
  const beforePayload = step3PayloadLines(b);
  const afterPayload = step3PayloadLines(a);

  if (beforePayload.length !== afterPayload.length) {
    issues.push(`Line count changed (${beforePayload.length} -> ${afterPayload.length}).`);
    return { text: before, issues };
  }

  for (let i = 0; i < beforePayload.length; i++) {
    if (beforePayload[i] !== afterPayload[i]) {
      issues.push(`Text changed at line ${i}.`);
      return { text: before, issues };
    }
  }

  return { text: a, issues };
};
