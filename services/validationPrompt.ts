
export const getMasterValidationPrompt = (language: string): string => {
  return `
    You are an expert document structure auditor for a document in ${language}. Your task is to act like a meticulous human editor. You must analyze the text for two types of headline errors: semantic and hierarchical.

    **--- CRITICAL RULE #1: IGNORE ALL BODY CONTENT ---**
    - You MUST COMPLETELY IGNORE any and all text that is inside a \`{{text_level}}...{{-text_level}}\` block or represented by a placeholder like '[CONTENT HIDDEN]'.
    - DO NOT analyze it. DO NOT report errors from it. DO NOT reference it. This content is irrelevant to your task. Your focus is ONLY on headlines that are OUTSIDE of these blocks.

    // FIX: Replaced backticks with single quotes to avoid potential linter errors.
    **--- CRITICAL RULE #2: 'original_text' MUST BE THE FULL LINE ---**
    - When you identify an error, the value you provide for the 'original_text' key in your JSON output MUST be the full, complete, and unmodified line of text where the error was found.

    **--- GUIDING PRINCIPLE: Local Context Over Global Consistency ---**
    -   Your analysis must prioritize the local parent-child structure over rigid global keyword consistency.
    -   For example, if you see \`{{level2}}Some Section{{-level2}}\` followed by \`{{level3}}Artículo 3{{-level3}}\`, this is a valid hierarchy and should NOT be flagged, even if another \`{{level2}}Artículo 10{{-level2}}\` exists elsewhere in the document under a different parent (\`{{level1}}PART II{{-level1}}\`).
    -   Only flag a semantic error if it's an OBVIOUS and unambiguous mismatch that also breaks the hierarchy. For example, \`{{level4}}CAPÍTULO V...\` is clearly wrong regardless of its parent, as "CAPÍTULO" is a top-level concept. Similarly, a \`{{level1}}\` cannot be a child of a \`{{level2}}\`.
    -   Trust the existing structure unless the content of the headline makes it impossible to be correct.

    **--- ERROR TYPE 1: Semantic Level Mismatch (Content-Aware Check) ---**
    Your primary task is to READ the content of each headline and judge if its assigned level tag is appropriate, following the Guiding Principle above.

    1.  **Analyze the text:** Look for keywords, numbering, and phrasing that imply a certain level of importance.
        -   High-Level Indicators: "Chapter", "Part", "Title", "Anexo", "Apéndice", Roman numerals (I, V, X). These should usually be \`{{level1}}\` or \`{{level2}}\`.
        -   Mid-Level Indicators: "Article", "Section", "Cláusula", numerical identifiers (1.1, 5.2). These are typically \`{{level2}}\` to \`{{level4}}\`.
        -   Low-Level Indicators: Letters or lowercase roman numerals ((a), (i)). These are almost always inside \`{{text_level}}\` blocks and should be ignored, but if they appear as headlines, they are low-level.

    2.  **Identify Mismatches:**
        -   **Promotion Error:** A high-level title is tagged with a low-level number.
            -   *Example:* \`{{level4}}CAPÍTULO V: DISPOSICIONES FINALES{{-level4}}\`
            -   *Analysis:* "CAPÍTULO" is a major section. It should not be \`level4\`. It should likely be \`level1\` or \`{{level2}}\`.
            -   *Correction:* Suggest changing it to the appropriate higher level (e.g., \`{{level1}}\`).
        -   **Demotion Error:** A low-level title is tagged with a high-level number.
            -   *Example:* \`{{level1}}Artículo 5.1 Definiciones{{-level1}}\`
            -   *Analysis:* "Artículo 5.1" is clearly a subsection, not a top-level \`level1\` headline.
            -   *Correction:* Suggest changing it to an appropriate lower level (e.g., \`{{level3}}\`).

    3.  **Suggestion Description:** When reporting a semantic error, your description MUST explain the reasoning. For example: "The content 'CAPÍTULO V' suggests a major document division and should be promoted from level 4 to level 1."

    **--- ERROR TYPE 2: Hierarchical SequenceError (Numeric Check) ---**
    This check is performed AFTER you are satisfied with the semantic level of the headlines.

    1.  **Rule:** A child headline's level number CANNOT be more than one level greater than its parent's level number.
    2.  **Example Error:**
        \`{{level1}}CHAPTER 1...{{-level1}}\`
        \`{{level3}}Section 1.01...{{-level3}}\`
    3.  **Analysis:** This is an error because a \`level3\` cannot be the direct child of a \`level1\`.
    4.  **Correction:** Suggest changing the \`level3\` tag to \`level2\`.
    5.  **Suggestion Description:** Your description should be clear. For example: "Headline level should be 2, as its parent is level 1. A headline's level cannot jump by more than one."

    **--- Output Instructions ---**
    - Your entire output MUST be a single, valid JSON array of objects that conforms to the provided API schema.
    - The 'type' property of each suggestion object MUST be 'HIERARCHY'.
    - If no errors of either type are found, return an empty array: [].
  `;
};

export const getTaskInstructionsForStep3_Validation_Chunked = (language: string, parentLevelContext: number): string => {
  return `
    You are an expert document structure auditor for a document in ${language}. Your task is to act like a meticulous human editor. You must analyze this text CHUNK for two types of headline errors: semantic and hierarchical.

    **--- CONTEXT ---**
    - The last headline level before this chunk began was \`level${parentLevelContext}\`.
    - You MUST use this information to validate the hierarchy of the VERY FIRST headline that appears in this chunk.
    - For all subsequent headlines within this chunk, their parent is the preceding headline within this same chunk.

    **--- CRITICAL RULE #1: IGNORE ALL BODY CONTENT ---**
    - You MUST COMPLETELY IGNORE any and all text that is inside a \`{{text_level}}...{{-text_level}}\` block or represented by a placeholder like '[CONTENT HIDDEN]'.
    - DO NOT analyze it. DO NOT report errors from it. This content is irrelevant.

    // FIX: Replaced backticks with single quotes to avoid potential linter errors.
    **--- CRITICAL RULE #2: 'original_text' MUST BE THE FULL LINE ---**
    - When you identify an error, the value you provide for the 'original_text' key in your JSON output MUST be the full, complete, and unmodified line of text where the error was found.

    **--- GUIDING PRINCIPLE: Local Context Over Global Consistency ---**
    - Your analysis must prioritize the local parent-child structure.
    - A headline like \`{{level3}}Artículo 3{{-level3}}\` under a \`{{level2}}Some Section{{-level2}}\` parent is likely CORRECT. Do not flag it just because other 'Artículo' headlines are a different level elsewhere.
    - Only flag a semantic error if it's an OBVIOUS mismatch (e.g., \`{{level4}}CAPÍTULO V...\`).

    **--- ERROR TYPE 1: Semantic Level Mismatch (Content-Aware Check) ---**
    Your primary task is to READ the content of each headline and judge if its assigned level tag is appropriate.

    1.  **Analyze the text:** Look for keywords like "Chapter", "Part" (high-level) vs. "Article", "Section" (mid-level).
    2.  **Identify Mismatches:**
        -   **Promotion Error:** A high-level title tagged with a low number (e.g., \`{{level4}}CAPÍTULO V...\`). Suggest promoting it.
        -   **Demotion Error:** A low-level title tagged with a high number (e.g., \`{{level1}}Artículo 5.1...\`). Suggest demoting it.
    3.  **Suggestion Description:** Your description MUST explain the semantic reasoning.

    **--- ERROR TYPE 2: Hierarchical Sequence Error (Numeric Check) ---**
    This is a secondary check.

    1.  **Rule:** A child headline's level number CANNOT be more than one level greater than its parent's level number.
    2.  **Example:** If context is \`level2\` and the first headline is \`{{level4}}\`, this is an error. Suggest \`{{level3}}\`.

    **--- Output Instructions ---**
    - Your entire output MUST be a single, valid JSON array of objects.
    - Do NOT include a 'line_number' field. This will be handled by the application.
    - If no errors are found, return an empty array: [].
  `;
};

export const getTaskInstructionsForStep1_Headlines = (language: string): string => {
  return `
    Your task is to identify and tag different levels of headlines in the provided text, which is in ${language}, with extreme precision. You must act as an expert typesetter who understands document structure intuitively.

    **--- IMPORTANT CONTEXT ---**
    The main document title has ALREADY been tagged with \`{{level0}}...{{-level0}}\`. You MUST NOT create any new \`{{level0}}\` tags or modify the existing one. Your work begins with identifying major divisions like Chapters or Parts to be tagged as \`{{level1}}\`.

    **--- VISUAL FORMATTING RULE (CRITICAL) ---**
    - **MANDATORY:** Every single headline you identify MUST be visually separated from the surrounding text.
    - If the input text has a headline run-on with the body text (e.g., "Article 1. Text starts here"), you MUST insert a newline after the closing tag.
    - **CORRECT:** \`{{level2}}Article 1.{{-level2}}\n\nText starts here\`
    - **WRONG:** \`{{level2}}Article 1.{{-level2}} Text starts here\`
    - Do not respect the original messy formatting. Fix it.

    **--- TAG SCHEMA ---**
    -   **Headlines:** \`{{level1}}\` to \`{{level5}}\` for progressively smaller sections.
    -   Each opening tag (e.g., \`{{level1}}\`) must have a corresponding closing tag (e.g., \`{{-level1}}\`).

    **--- CRITICAL HEADLINE RULES ---**

    1.  **HIERARCHY IS KING:** Your primary goal is to create a logical hierarchy.
        *   **Rule:** A child headline must be exactly one level deeper than its parent.
        *   **Visual Cues:** Use indentation, font styles (if discernible from text), and numbering as strong indicators of hierarchy.

    2.  **Splitting Combined Headlines:** A single line of text might contain multiple distinct headlines that must be separated.
        *   **Example Input:** \`PART 2 GENERAL DEFINITIONS Article 2.1 Definitions\`
        *   **Analysis:** This contains TWO headlines.
        *   **Correct Output:**
            \`{{level1}}PART 2 GENERAL DEFINITIONS{{-level1}}\`
            \`{{level2}}Article 2.1 Definitions{{-level2}}\`

    3.  **Merging Split Headlines:** A single conceptual title might be split across multiple lines. These must be merged into a single headline tag.
        *   **Example Input:**
            \`CHAPTER 1\`
            \`INITIAL PROVISIONS AND GENERAL DEFINITIONS\`
        *   **Analysis:** This is ONE headline.
        *   **Correct Output:** \`{{level1}}CHAPTER 1 INITIAL PROVISIONS AND GENERAL DEFINITIONS{{-level1}}\`

    **--- FINAL INSTRUCTIONS ---**
    -   Your output must be the text with the specified tags added AND proper newlines inserted around headlines.
    -   Do NOT tag paragraphs. Only tag headlines.
  `;
};

export const getTaskInstructionsForStep1_Footnotes = (language: string): string => {
  return `
You are a specialized legal-document footnote tagger. The document is in ${language}.
You will be given a block of text that may contain one or more sections marked with
[FOOTNOTE_CONTEXT FOR #X]...[/FOOTNOTE_CONTEXT FOR #X].

Each such block is a local context: it usually contains both the in-text reference and the corresponding explanatory note, but sometimes it may contain only one of them. You NEVER have a guarantee of seeing the entire document.

Your task is to analyze EACH context block independently. Inside each block, identify and tag footnote references (e.g., {{footnotenumberX}}) and their corresponding content (e.g., {{footnoteX}}) based on the rules below.

Your final output must be the complete text of all context blocks you were given, with the correct footnote tags added or adjusted inside those blocks only.
Do not add any text outside of the context blocks or change any existing {{levelX}} tags.

In this step your ONLY job is to detect and correctly tag footnote references
in the main text and the corresponding footnote contents.

You must ONLY add or adjust:

{{footnotenumberX}}...{{-footnotenumberX}}

{{footnoteX}}...{{-footnoteX}}

Do NOT:

add/remove/modify any {{levelX}}, {{text_level}} or other tags,

rewrite, translate or summarise text.

================================================
1. TAGGING RULES
================================================

1.1 Schema
Reference in body text: {{footnotenumberX}}...{{-footnotenumberX}}
Footnote content: {{footnoteX}}...{{-footnoteX}}
X is always the numeric index of the footnote (1, 2, 3, ...).

1.2 Objective
Your goal is to identify ALL footnote references and ALL footnote content blocks present in the text chunk.
- If you see a reference, tag it.
- If you see a content block, tag it.
- Ideally they appear in pairs, but if a reference exists without the content (e.g. content is on next page), TAG THE REFERENCE anyway.
- If content exists without the reference (e.g. reference is on previous page), TAG THE CONTENT anyway.

Do NOT delete or ignore a tag just because its pair is missing in this specific chunk.

1.3 Existing tags MUST be preserved

If this chunk already contains {{footnotenumberX}} and/or {{footnoteX}}, you MUST keep them exactly as they are, including their index X and their text.

You are NOT allowed to delete, merge, or split existing {{footnoteX}} or {{footnotenumberX}} tags.

================================================
2. DETECTING REFERENCES IN BODY TEXT

2.1 What a reference looks like

Mark as reference any small numeric marker that:

is visually attached to a word, number, or punctuation, and

is clearly not a heading number, list item, page number, line number,
date, or monetary/quantitative value.

**OCR ARTIFACTS WARNING:**
Often, OCR processes will insert a space between a word and its footnote number.
YOU MUST DETECT THESE.
- Example: "end of the sentence. 1 Start of next" -> Tag "1" as {{footnotenumber1}}.
- Example: "important term 2 and then" -> Tag "2" as {{footnotenumber2}}.

Typical shapes (language-agnostic):
word1, word.1, word1/, word[1], word(1)
word 1 (with space), word. 1 (with space)

Wrap ONLY the marker (and immediate symbols) in {{footnotenumberX}}.

2.2 What is NOT a reference

Do NOT tag as footnote:

article / section / chapter numbers (e.g. Article 12.1, Artículo IV-10),

numbered list items (1., 2., a), (i), etc.),

page or line numbers,

dates (2022, 1 January 2023),

amounts (10%, USD 100, 1 000 000).

If you are not clearly sure that a marker is a footnote reference, do not tag it.

================================================
3. DETECTING FOOTNOTE CONTENT BLOCKS

3.1 General shape

Footnote content is usually:

grouped at the bottom of a page or at the end of a section,

introduced by the same number X as the reference (e.g. 1, 1/, [1], (1)),

a complete explanatory sentence or paragraph, often starting with phrases like
"For greater certainty", "For the purposes of this Article",
"For the avoidance of doubt", but it may be any explanatory legal text.

When you find such a block in the same context as its reference:

wrap the entire note with {{footnoteX}}...{{-footnoteX}},

ensure X matches the number in its leading marker AND the body reference(s).

================================================
4. INTERACTION WITH {{text_level}} AND {{levelX}}

You MUST NOT move {{text_level}} boundaries.

You MUST NOT introduce new {{levelX}} tags or change their level numbers.

Footnote content must NOT be converted into {{levelX}} content inside
{{text_level}} blocks.

If an explanatory paragraph that belongs to a footnote currently appears
inside a {{text_level}} block wrapped in {{levelX}}:

keep the text and the {{levelX}} wrapper exactly as they are,

you MAY additionally wrap the whole paragraph in {{footnoteX}}...{{-footnoteX}}

Never remove or downgrade an existing {{footnoteX}} wrapper to plain text
or to a {{levelX}} headline.

================================================
5. OUTPUT

Return the original text with only:

{{footnotenumberX}}...{{-footnotenumberX}}

{{footnoteX}}...{{-footnoteX}}

added or corrected according to these rules.

Do NOT add comments, explanations, or any other text.
`;
};


export const getTaskInstructionsForStep3_BatchFix = (language: string): string => {
  return `
You are a legal-document structure **repair** system. The document is in ${language}
and is ALREADY parsed with headline tags ({{levelX}}) and content blocks ({{text_level}}).

Your job in Stage 3 is VERY CONSERVATIVE:
- Fix obvious hierarchy mistakes (wrong level numbers, bad parent→child jumps).
- Normalize {{text_level}} boundaries.
- Do NOT rewrite or "re-interpret" the document.

============================================================
0. ABSOLUTE INVARIANTS (MUST NEVER BE VIOLATED)
============================================================

0.1 Headlines
- Every existing headline tag \`{{levelN}}...{{-levelN}}\` MUST still exist in the output.
- You are allowed to change ONLY the number N (e.g. level3 → level2).
- You are NOT allowed to:
  - remove a headline wrapper,
  - turn a headline into plain text,
  - merge two headlines into one,
  - split one headline into several headlines,
  - move the text inside a headline to another headline.

0.2 Text content
- The text inside each headline or inside {{text_level}} MUST remain verbatim.
- Do NOT add, delete, or rewrite words or punctuation.

0.3 Footnotes
- If the document contains \`{{footnoteX}}\` or \`{{footnotenumberX}}\`, do NOT touch or move them.

0.4 Allowed operations (and ONLY these):
1) Change numeric level of an existing headline: \`{{level3}}...\` → \`{{level2}}...\`.
2) Move the OPEN or CLOSE of a \`{{text_level}}\` block up or down to include/exclude
   already existing lines, when needed to make the structure consistent.
3) Insert or remove empty/redundant \`{{text_level}}\` blocks (blocks that contain no content).

Everything else is FORBIDDEN.

============================================================
1. GENERAL GOAL
============================================================

The input document is already *mostly* correct. Your goal is:

- Repair inconsistent headline levels (e.g. jumping from level1 to level3 directly).
- Ensure that body content is wrapped in {{text_level}} blocks in a coherent way.
- Preserve all headlines as headlines.

If you are not 100% sure a change is necessary, DO NOTHING and keep the original structure.

============================================================
2. HEADLINE HIERARCHY FIXES
============================================================

2.1 Local hierarchy rule
- A child headline MUST be exactly one level deeper than its parent:
  parent = levelK → direct child must be level(K+1).

2.2 Context
- Use the nearest previous headline outside {{text_level}} as the parent context.
- If the very first headline of the document is \`{{level0}}\`, treat it as the root;
  the next structural block (e.g. CHAPTER, CAPITULO, TÍTULO) is usually \`level1\`.

2.3 What you can change
- If you see, for example:
  \`{{level1}}CAPITULO I...{{-level1}}\`
  \`{{level3}}Artículo I-1...{{-level3}}\`
  this is a numeric jump (1 → 3). You may safely change \`level3\` to \`level2\`.

- Only change the LEVEL NUMBER. Never alter the text.

============================================================
3. INTERAÇÃO COM {{text_level}}
============================================================

3.1 Nunca apagar níveis dentro de {{text_level}}
Inside any \`{{text_level}} ... {{-text_level}}\` block:

- You MUST keep all \`{{levelX}}...{{-levelX}}\` exactly as headlines.
- You MUST NOT:
  - remove \`{{levelX}}\` tags,
  - convert a \`{{levelX}}\` line into plain text,
  - “downgrade” a headline to raw content.

Examples of what is FORBIDDEN:

- Input:
  \`{{text_level}}\`
  \`{{level3}}La Comisión...{{-level3}}\`
  \`{{-text_level}}\`

  Output like:
  \`{{text_level}}\`
  \`La Comisión...\`
  \`{{-text_level}}\`

  is ILLEGAL. The \`{{level3}}\` wrapper MUST remain.

3.2 You may adjust the numeric level inside {{text_level}}
- If a \`{{levelX}}\` inside {{text_level}} violates the rule
  "internal level must be strictly greater than the parent headline level",
  you may adjust X upwards (e.g. parent level2 → inside block at least level3).

3.3 You may move {{text_level}} boundaries around headlines
You are allowed to move the opening or closing of \`{{text_level}}\` so that
headlines are associated correctly.

Example (pattern from the Brazil–Mexico FTA preamble):

WRONG:
{{level1}}Preámbulo{{-level1}}
{{text_level}}
{{level2}}Los Plenipotenciarios de la República Federativa del Brasil...{{-level2}}
{{-text_level}}

CORRECT:
{{level1}}Preámbulo{{-level1}}
{{level2}}Los Plenipotenciarios de la República Federativa del Brasil...{{-level2}}

{{level2}}CONSIDERANDO:{{-level2}}
{{text_level}}
{{level3}}La necesidad de fortalecer el proceso de integración de América Latina...{{-level3}}
{{level3}}Que la integración económica regional constituye uno de los instrumentos esenciales...{{-level3}}
...
{{-text_level}}

- In this example you:
  - KEEP \`{{level2}}...{{-level2}}\` as a headline,
  - move the \`{{text_level}}\` block so that it starts after the preamble headline,
  - keep all inner \`{{level3}}\` lines intact.

3.4 Nunca transformar um bloco de headlines em texto simples
Even if a group of \`{{levelX}}\` lines looks like “prose” to you,
you are NOT allowed to strip the level tags.

If you think those lines should behave as body text, the legal way to do it is:
- ensure they are inside a \`{{text_level}}\` block,
- adjust their level numbers relative to the parent,
BUT always keep the \`{{levelX}}...{{-levelX}}\` wrappers.

============================================================
4. FINAL AUDIT (VERY CONSERVATIVE)
============================================================

At the end:

4.1 Checks you MUST enforce
- No jumps in the hierarchy: levelK directly followed by level(K+2) must be fixed.
- All body-like text that is NOT already inside {{text_level}} and is not a headline
  MAY be wrapped in a new \`{{text_level}} ... {{-text_level}}\` block.

4.2 Checks you MUST NOT perform
- Do NOT reclassify an existing headline as “body text”.
- Do NOT remove headlines inside {{text_level}}.
- Do NOT guess new structural patterns that are not clearly present.

============================================================
5. OUTPUT
============================================================

- Output ONLY the fully corrected document text.
- Do NOT add explanations, comments, JSON or metadata.
- The number of headline tags (lines starting with \`{{level\`) MUST be identical
  between input and output; only the numeric levels and positions of
  {{text_level}} / {{-text_level}} may have changed.

`;
};
