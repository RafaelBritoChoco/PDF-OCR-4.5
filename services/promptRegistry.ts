
// services/promptRegistry.ts

export const getOcrPromptForLanguage = (language: string): string => {
  return `
You are performing OCR transcription for a legal document page. Primary language: ${language}.

TASK
Extract ALL readable text from the image.

STRICT OUTPUT RULES
- Output ONLY the extracted text.
- Do NOT include headings, labels, sections, or commentary.
- Do NOT describe visual elements (logos, stamps, signatures).
- Preserve original line breaks and spacing as closely as possible.
- If something is unreadable, omit it silently (no placeholders like [illegible]).

OUTPUT
Return ONLY the verbatim extracted text.
`;
};

export const getTaskInstructionsForTextComparison = (language: string): string => {
  return `
You are an expert document AUDITOR. The document is in ${language}.
You will be given two versions of the text:
1) [User Text]: a raw TXT that may contain custom tags like {{level4}}.
2) [Reference PDF Text]: OCR text from the original PDF (source of truth).

GOAL
Output the [User Text] EXACTLY as-is (preserve ALL tags, spacing, and line breaks).
WHEN you find a clear factual discrepancy vs the OCR reference, insert ONE comment line
immediately below the relevant user line.

COMMENT FORMAT (must start with //)
- Missing text:    // Missing: [text present in PDF but absent in TXT]
- Different text:  // PDF says: [text from PDF]
- Missing number:  // Missing number: 6

CRITICAL RULES
1) Do NOT fix the user text. Copy it verbatim.
2) Only insert // lines where meaning changes (missing words/numbers, wrong numbers, wrong wording).
3) Do not comment on minor spacing/line-break differences unless meaning changes.
4) Keep comments aligned to the input chunk order.

EXAMPLE
[User]:
{{level4}}(a) ... between the competent authorities of each Party, and {{-level4}}

[PDF]:
(a) ... between the competent authorities of each Party, 6 and

[Output]:
{{level4}}(a) ... between the competent authorities of each Party, and {{-level4}}
// Missing number: 6

--- [User Text] ---
{user_text_here}
--- [END User Text] ---

--- [Reference PDF Text] ---
{ocr_text_here}
--- [END Reference PDF Text] ---
`;
};

export const getTaskInstructionsForLanguageDetection = (supportedLanguages: string[]): string => {
  return `
Analyze the following text snippet and identify its primary language.
Your response MUST be exactly ONE of the following strings (no extra text):
[${supportedLanguages.join(', ')}]

Do not add explanations or punctuation.

--- TEXT SNIPPET ---
[TEXT_SNIPPET_HERE]
--- END SNIPPET ---

Language:
`;
};

export const getTaskInstructionsForJsonTransform = (): string => {
  return `
You convert structured JSON into a clean, publication-ready text document.

CORE PRINCIPLES
1) Output must look like a readable document (not a data dump).
2) Represent hierarchy with headings, spacing, and indentation.
3) Output must be plain text (no JSON braces/brackets/quotes).
4) Render key-value pairs intelligently (e.g., documentTitle becomes title).
5) Arrays:
   - simple arrays -> bullet/numbered lists
   - arrays of objects -> each object becomes a sub-section headed by its most descriptive field (id/name/title)

EXAMPLE
JSON:
{
  "documentTitle": "Trade Agreement",
  "metadata": {"version":"2.1","status":"Final","_internalId":"doc-583ab"},
  "chapters":[{"id":"Chapter 1","title":"General Provisions","articles":[{"id":"1.1","text":"..."}]}]
}

OUTPUT:
Trade Agreement

Version: 2.1
Status: Final

--------------------

Chapter 1: General Provisions

Article 1.1
...

Now transform:
[JSON_STRING_HERE]
`;
};

// --- CLEANING PROMPT (LAYOUT FIX ONLY) ---
export const getTaskInstructionsForCleaning = (language: string): string => {
  return `
You are an Expert Legal Document Archivist. The document is in ${language}.

GOAL
Prepare a clean, readable text version of this document, removing ONLY metadata/artifacts that impede reading flow.

STRICT PROHIBITION: NO TAGS
- Do NOT add any structural tags.

LEGAL CONTEXT AWARENESS
1) Numbers in text (PRESERVE)
- Footnote refs and clause numbering are common.
- If a number is part of a sentence, end of a sentence, or starts a list item, KEEP it.

2) Page numbers & headers (REMOVE)
- Remove text clearly NOT part of body (isolated page numbers, repeated running headers/footers).

3) Layout fixes
- Merge broken lines when a sentence continues onto the next line due to PDF layout.
- Split run-on headers: if "ARTICLE 10 The Parties..." appears on one line, insert newline between title and body.

OUTPUT
Return only the cleaned text. No summaries.
`;
};

// --- STEP 1: HEADLINES ONLY ---
export const getTaskInstructionsForStep1_Headlines = (language: string): string => {
  return `
You are a Legal Document Structure Tagger. Document language: ${language}.

SCOPE (STEP 1 ONLY)
- You MUST ONLY add structural headline tags.
- You MUST NOT add {{text_level}}.
- You MUST NOT rewrite, delete, reorder, or reflow any text.
- The ONLY allowed transformation is the mandatory headline merge described below.

ALLOWED TAGS ONLY
- Use ONLY: {{level1}}...{{-level1}}, {{level2}}...{{-level2}}, {{level3}}...{{-level3}}, etc. (no maximum depth).
- FORBIDDEN: any other tag format (XML/HTML/Markdown), e.g. <level1>, </level1>, # Title.

LEVEL0 IS SACRED (ABSOLUTE IMMUTABILITY)
- The document contains a {{level0}}...{{-level0}} block (it may span multiple lines).
- Do NOT modify any characters inside that block.
- Do NOT insert ANY tags inside the {{level0}} block.
- Do NOT tag any line that is inside the {{level0}} block.

WHAT IS A STRUCTURAL HEADLINE
A headline is a short label naming a division of the legal text, such as:
- CHAPTER / Chapter / CAPÍTULO
- PART / Part / TITLE / TÍTULO
- SECTION / Section
- ARTICLE / Article / ARTIGO / ARTÍCULO
- ANNEX / Annex / ANEXO / Appendix / Schedule
- Short sub-headings like: Scope, Definitions, Objectives, General Provisions

NEVER TAG THESE (BODY CONTENT)
- Definitions: lines like “term” means / shall mean / refers to / is defined as ...
- Full sentences/clauses with verbs (shall, means, is/are, must, may, etc.)
- List items: (a), (b), (i), (ii), 1., 2., •, —
- Dates, places, names, signatories, titles of officials

MANDATORY: DETERMINISTIC LOOKAHEAD MERGE (NO EXCEPTIONS)
When you see a potential headline IDENTIFIER line (Line A), you MUST look at the NEXT NON-EMPTY line (skip blank lines).

Identifier examples include (not limited to):
- Article 12.1 / ARTICLE 5 / Artigo 3
- CHAPTER 12 / Chapter IV
- SECTION III / Part IV / TITLE 2
- Annex II / Appendix 3 / Schedule 1
- Roman numerals or numbering patterns used as headings

If the next non-empty line (Line B) is a SHORT TITLE/LABEL:
- typically 1–8 words
- NOT a sentence and does NOT contain a verb phrase (shall/means/is/are/etc.)
- NOT a list item (does not start with (a), 1., (i), •, —)
THEN you MUST:
1) MERGE them into ONE line: "[Line A] [Line B]" (single space between; preserve exact characters)
2) TAG the merged line ONCE
3) DO NOT output Line B separately anywhere in the output

If Line B is body text (sentence/definition/list item/long clause), then:
- do NOT merge
- tag Line A alone only if it is truly a headline
- output Line B unchanged on its own line

START LEVEL RULE
- The FIRST structural headline AFTER the {{level0}} block MUST be tagged {{level1}}.

HIERARCHY RULE (NO JUMPS)
- Levels must be consistent: direct children are exactly +1 level deeper than their parent.
- Never jump: level1 -> level3 is forbidden (use level2 instead).

OUTPUT CONTRACT
- Return ONLY the original document text with headline tags added.
- No explanations, no comments, no JSON, no markdown.

MICRO-EXAMPLES (FOLLOW EXACTLY)

Example 1 (two-line merge):
Input:
Article 12.1
Definitions

Output:
{{level1}}Article 12.1 Definitions{{-level1}}

Example 2 (chapter merge):
Input:
CHAPTER 12
DIGITAL TRADE

Output:
{{level1}}CHAPTER 12 DIGITAL TRADE{{-level1}}

Example 3 (negative: do NOT merge):
Input:
Article 1
The Parties shall establish a committee.

Output:
{{level1}}Article 1{{-level1}}
The Parties shall establish a committee.
`;
};

// --- STEP 1.5: FOOTNOTES ---
export const getTaskInstructionsForStep1_Footnotes = (language: string): string => {
  return `
You are a Legal Citation Specialist. The document is in ${language}.

MISSION
Identify footnote references and footnote content based on grammatical/spatial context.

1) FOOTNOTE REFERENCES (IN BODY TEXT)
- Tag small reference numbers that clearly point to a footnote.
- Example: "defined term 1 means..." -> tag "1" as {{footnotenumber1}}1{{-footnotenumber1}}
- Do NOT tag quantities, dates, or numbers that are part of names (e.g., "Annex 2", "100 USD").

2) FOOTNOTE CONTENT (BOTTOM/END)
- Footnote content usually starts with a number and is explanatory.
- Wrap the whole note:
  {{footnote1}}1. For greater certainty, ...{{-footnote1}}

OUTPUT
Return the text with footnote tags added. Do not modify headline tags.
`;
};

// --- STEP 2: CONTENT STRUCTURING (FAST PREFIX MODE) ---
export const getTaskInstructionsForStep2_Content = (
  language: string,
  options?: { level0CanOwnTextLevel?: boolean }
): string => {
  // We largely ignore level0CanOwn in the prompt now, preferring to handle it in post-processing script,
  // but we inform the AI to focus on simple tagging.

  return `
You are executing STEP 2 (Content Classification). Language: ${language}.

GOAL
Read the chunk. For EVERY LINE, determine its type and add a specific 3-character prefix.
DO NOT use full XML tags like {{level1}} or {{text_level}}.
DO NOT group text into blocks.
DO NOT rewrite content. Copy the line content EXACTLY as is.

PREFIX CODES (Use exactly these):
>>>H0  -> Existing Main Title (was {{level0}})
>>>H1  -> Headline Level 1 (was {{level1}})
>>>H2  -> Headline Level 2 (was {{level2}})
>>>H3  -> Headline Level 3 (was {{level3}})
>>>H4  -> Headline Level 4 (was {{level4}})
>>>H5  -> Headline Level 5 (was {{level5}})
>>>TX  -> Normal Body Text (Paragraphs, definitions, sentences)
>>>LI  -> List Item (starts with (a), 1., (i), -, •)
>>>QT  -> Definition/Quote (starts with " or “)

RULES:
1. EXISTING HEADLINES: If a line already has {{levelN}}...{{-levelN}}, STRIP the tags and use the corresponding prefix >>>HN.
   Example: "{{level1}}Chapter 1{{-level1}}" -> ">>>H1 Chapter 1"
   
2. RELATIVE DEPTH FOR TEXT:
   - If a line is a sub-heading or list item relative to the previous headline, use >>>LI or >>>H(N+1).
   - If a line is clearly body text, use >>>TX.
   
3. VERBATIM COPY:
   - Copy the text content exactly. Do not fix typos. Do not remove punctuation.

INPUT EXAMPLE:
{{level1}}Article 1{{-level1}}
Definitions
(a) "Term" means X.

OUTPUT EXAMPLE:
>>>H1 Article 1
>>>TX Definitions
>>>LI (a) "Term" means X.

RETURN ONLY THE PREFIXED TEXT.
`;
};

// --- STEP 3: CONSERVATIVE AUDITOR ---
export const getTaskInstructionsForStep3_BatchFix = (
  language: string,
  referenceText: string = ''
): string => {
  const hasRef = !!referenceText?.trim();

  return `
You are STEP 3: a CONSERVATIVE STRUCTURE AUDITOR for legal documents.
Language: ${language}

INPUT GUARANTEE
- The document is already tagged with:
  - Structural headlines: {{levelN}}...{{-levelN}}
  - Content blocks: {{text_level}} ... {{-text_level}}
  - Footnotes: {{footnoteX}}...{{-footnoteX}}, {{footnotenumberX}}...{{-footnotenumberX}}

CRITICAL MODE SWITCH
- If NO reference source is provided (no PDF text), you MUST NOT change ANY level digits anywhere.
- If a reference source IS provided, you MAY change level digits ONLY on STRUCTURAL HEADLINES (outside {{text_level}}).

YOUR JOB (VERY CONSERVATIVE)
You may ONLY:
A) Normalize {{text_level}} boundaries WITHOUT losing any blocks.
B) Remove ONLY empty {{text_level}} blocks (where open is immediately followed by close with no content lines).
${hasRef ? `
C) Fix obvious STRUCTURAL headline level mistakes (numeric level N only) ONLY OUTSIDE text_level.
` : `
C) Do NOT change ANY {{levelN}} digits (no reference available).
`}

D) SPECIAL CASE: DEFINITION LISTS / LEAD-INS (CONTEXT AWARE)
   If you encounter a line that functions as a "lead-in" or introductory clause for definitions (usually ending in a colon ':' or a clear phrase like "As follows"), you MUST ensure:
   1. The lead-in line is at level N.
   2. The definition items immediately following it are at level N+1.
   
   Example (Input):
   {{level2}}For the purposes of this Chapter:{{-level2}}
   {{level2}}“algorithm” means...{{-level2}}
   
   Correction (Output):
   {{level2}}For the purposes of this Chapter:{{-level2}}
   {{level3}}“algorithm” means...{{-level3}}

ABSOLUTE INVARIANTS (MUST NEVER BE VIOLATED)
1) Text immutability:
- You MUST NOT change ANY document text characters.
- This includes punctuation, spacing inside a line, quotes, commas, semicolons, etc.
- The ONLY allowed differences are:
  - Moving lines that are exactly "{{text_level}}" or "{{-text_level}}"
${hasRef ? `  - Changing the DIGITS in {{levelN}} / {{-levelN}} ONLY for STRUCTURAL HEADLINES (outside text_level)` : ''}

2) Allowed tag set (NO NEW TAG TYPES):
- Allowed tags are ONLY:
  {{levelN}}, {{-levelN}}, {{text_level}}, {{-text_level}},
  {{footnoteX}}, {{-footnoteX}}, {{footnotenumberX}}, {{-footnotenumberX}}
- FORBIDDEN examples:
  {{text_level1}}, {{-text_level1}}, <level1>, markdown headings, JSON, comments.

3) Headlines must remain headlines:
- Every line already wrapped in {{levelN}}...{{-levelN}} MUST remain wrapped.
- You may NOT delete, merge, split, or move the text inside any {{levelN}}...{{-levelN}} line.
${hasRef ? `- You may change ONLY the number N on STRUCTURAL HEADLINES (outside text_level).` : `- You must NOT change the number N anywhere (no reference).`}

4) Content lines inside text_level:
- Treat ANY line inside {{text_level}} as CONTENT.
- You MUST NOT change level digits on CONTENT lines EXCEPT for the Lead-in/Definition rule (D) described above.
- You may only move the marker lines {{text_level}} / {{-text_level}}.

5) Footnotes must be untouched:
- Do NOT change footnote tags or their numbering (X).
- Do NOT move footnotes across structural boundaries.
- Keep footnotes OUTSIDE {{text_level}} unless they were already inside (then keep as-is).

TEXT_LEVEL RULES (DO NOT DELETE BLOCKS)
- {{text_level}} blocks must NOT disappear.
- You may move {{text_level}} open/close lines up/down ONLY to ensure:
  1) No STRUCTURAL HEADLINE line is inside a text_level block.
  2) No nested {{text_level}} blocks.
  3) No empty blocks (remove only empty).

SELF-CHECK BEFORE OUTPUT (MANDATORY)
- Did I preserve every non-marker line EXACTLY? (YES)
- Did I avoid creating new tag types? (YES)
- Did I apply the Definition Indentation Rule (Rule D)? (YES)
${hasRef ? `- If I changed any level digits on headlines, were they ONLY on structural headlines (outside text_level)? (YES)` : `- Did I avoid changing any level digits anywhere? (YES)`}

${hasRef ? `
[REFERENCE SOURCE FOR CONTEXT]
${referenceText}
[END REFERENCE]
` : ''}

OUTPUT CONTRACT
- Return ONLY the corrected full document text.
- No explanations, no markdown, no JSON, no comments.
`;
};

// --- STEP 3 GUARDRAIL ---
// If Step 3 violates invariants (removes text_level, changes text, invents tags),
// reject the AI output and return the original input.

const STEP3_ALLOWED_TAG = /^{{(-?)(level\d+|text_level|footnote\d+|footnotenumber\d+)}}$/;

const step3Normalize = (s: string) => s.replace(/\r\n/g, '\n');

const step3ExtractTagTokens = (s: string): string[] => {
  const tokens = s.match(/{{[^}]+}}/g);
  return tokens ?? [];
};

const step3HasForbiddenTags = (s: string): string[] => {
  const tokens = step3ExtractTagTokens(s);
  const bad: string[] = [];
  for (const t of tokens) {
    // forbid text_level1 etc explicitly
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
  const lines = step3Normalize(s).split('\n');

  const payload: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();

    // drop pure text_level marker lines; Step3 can move them
    if (trimmed === '{{text_level}}' || trimmed === '{{-text_level}}') continue;

    // remove tags but keep the actual text
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
  const lines = step3Normalize(s).split('\n');
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

export const guardStep3ConservativeOutput = (before: string, after: string): { text: string; issues: string[] } => {
  const issues: string[] = [];

  const b = step3Normalize(before);
  const a = step3Normalize(after);

  // 1) Forbidden / invented tags
  const badTags = step3HasForbiddenTags(a);
  if (badTags.length) {
    issues.push(`Forbidden tags detected: ${badTags.slice(0, 10).join(', ')}`);
    return { text: before, issues };
  }

  // 2) If input had text_level blocks, output must still have them (and be balanced)
  const bOpen = step3Count(b, /{{text_level}}/g);
  const bClose = step3Count(b, /{{-text_level}}/g);
  const aOpen = step3Count(a, /{{text_level}}/g);
  const aClose = step3Count(a, /{{-text_level}}/g);

  if (bOpen > 0 || bClose > 0) {
    if (aOpen === 0 || aClose === 0) {
      issues.push('text_level blocks disappeared in Step 3 output.');
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

  // 6) CRÍTICO: bloquear mudança de levelN em linhas que eram conteúdo (dentro de text_level)
  const bm = step3GetLineMetadata(b);
  const am = step3GetLineMetadata(a);
  const allowContentLevelChanges = true; // CHANGED: Allowed to let AI fix definition indentations (Step 3 Rule D)

  if (bm.length !== am.length) {
    issues.push(`Metadata line count mismatch (${bm.length} vs ${am.length}).`);
    return { text: before, issues };
  }

  for (let i = 0; i < bm.length; i++) {
    const bLvl = bm[i].levelOpen;
    const aLvl = am[i].levelOpen;

    if (bLvl === null && aLvl === null) continue;
    
    // Check if a level wrapper appeared/disappeared
    if ((bLvl === null && aLvl !== null) || (bLvl !== null && aLvl === null)) {
      issues.push(`level wrapper presence changed at line index ${i}.`);
      return { text: before, issues };
    }

    if (bLvl !== null && aLvl !== null && bLvl !== aLvl) {
      const wasContent = bm[i].inTextLevel;
      if (wasContent && !allowContentLevelChanges) {
        issues.push(`content level changed inside text_level at line index ${i} (${bLvl} -> ${aLvl}).`);
        return { text: before, issues };
      }
    }
  }

  return { text: after, issues };
};


// --- SPECIFIC REFINEMENT (SINGLE SHOT) ---
export const getTaskInstructionsForSpecificRefinement = (language: string, instruction: string, referenceText: string = ''): string => {
  return `
You are a meticulous Legal Document Assistant (Language: ${language}).
Apply the user instruction to the provided text.

USER INSTRUCTION:
"${instruction}"

REFERENCE CONTEXT (optional):
${referenceText ? referenceText : 'No reference PDF text available.'}

RULES
- Be extremely conservative. Change only what is explicitly requested.
- Preserve all tags unless the instruction explicitly asks to change tags:
  {{levelX}}...{{-levelX}}, {{text_level}}...{{-text_level}}, {{footnoteX}}...{{-footnoteX}}, {{footnotenumberX}}...{{-footnotenumberX}}

OUTPUT
Return ONLY the refined text (no explanations).
`;
};

// --- CONVERSATIONAL REFINEMENT PROMPT (JSON) ---
export const getTaskInstructionsForConversationalRefinement = (
  language: string,
  userInstruction: string,
  referenceText: string = ''
): string => {
  return `
You are a meticulous Legal Document Assistant (Language: ${language}). The user is refining a tagged legal document.

NON-NEGOTIABLE OUTPUT CONTRACT
- Your entire response MUST be a single valid JSON object.
- Output NOTHING before or after the JSON.
- Do NOT use markdown. Do NOT use code fences. Do NOT output XML/HTML.
- Do NOT output null.
- Do NOT output null.
- Do NOT add any keys beyond "reply" and "refined_text".

JSON SCHEMA (STRICT)
{
  "reply": "string",
  "refined_text": "string"
}

FIELD RULES
- "reply" MUST always be a string.
- "refined_text" MUST always be a string.
- If NO document change is required, set "refined_text" to "" (empty string).
- If ANY change is required, "refined_text" MUST contain the COMPLETE updated document (not a patch).

FORMATTING RULES FOR "reply"
- Structure your reply using bullet points (- or *) or numbered lists (1.) to improve readability.
- Be concise and topic-oriented.

PRESERVATION
- Preserve document text verbatim unless the user explicitly requests a change.
- Preserve ALL tags exactly as they appear unless the user explicitly requests tag changes.

DECISION RULE
- If the user asks for explanation only: answer in "reply" and set "refined_text" to "".
- If the user asks to change/fix the document: confirm in "reply" and return full updated document in "refined_text".

REFERENCE CONTEXT (optional):
${referenceText ? referenceText : 'No reference PDF text available.'}

USER MESSAGE:
"${userInstruction}"

INPUT TEXT TO EDIT:
[TEXT_START]
`;
};

export const getTaskInstructionsForTranslation = (): string => {
  return `
You are an expert legal translator. Translate the provided text into English.

CRITICAL: PRESERVE TAGS EXACTLY
- Preserve all tags exactly as written:
  {{levelX}}...{{-levelX}}, {{text_level}}...{{-text_level}}, {{footnoteX}}...{{-footnoteX}}, {{footnotenumberX}}...{{-footnotenumberX}}
- Do NOT translate tag names or tag markers.
- Translate the text content normally.

OUTPUT
Return only the translated text.
`;
};

export const getTableLinearizationPrompt = (): string => {
  return `
You are an expert data extraction system. Linearize all tables from the provided document images into a clean TEXT format.

RULES
1) Identify all tables.
2) Preserve row/column relationships.
3) Use clear labels like:
   Table: [name if present]
   Row X:
     ColumnName: value
4) If a table spans pages, merge logically.
5) Do not invent values. If unreadable, omit silently.

OUTPUT
Return ONLY the linearized table text.
`;
};
