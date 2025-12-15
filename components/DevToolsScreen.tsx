
import React, { useState, useCallback } from 'react';
import {
    getOcrPromptForLanguage,
    getTaskInstructionsForJsonTransform,
    getTaskInstructionsForLanguageDetection,
    getTaskInstructionsForTranslation,
    getTableLinearizationPrompt,
    getTaskInstructionsForCleaning,
    getTaskInstructionsForStep1_Headlines,
    getTaskInstructionsForStep1_Footnotes,
    getTaskInstructionsForStep2_Content,
    getTaskInstructionsForStep3_BatchFix,
} from '../services/promptRegistry';
import { SUPPORTED_LANGUAGES } from '../constants';


const useCopyToClipboard = (): [(text: string) => void, string | null] => {
    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const copyToClipboard = useCallback((text: string, key: string) => {
        navigator.clipboard.writeText(text).then(() => {
            setCopiedKey(key);
            setTimeout(() => setCopiedKey(null), 2000); 
        }, (err) => {
            console.error('Could not copy text: ', err);
        });
    }, []);
    
    const memoizedCopy = useCallback((text: string, key: string) => copyToClipboard(text, key), [copyToClipboard]);
    
    const handleCopy = (text: string) => {
      const key = text.slice(0, 20); 
      memoizedCopy(text, key);
    };

    return [handleCopy, copiedKey];
};


interface PromptDisplayProps {
    title: string;
    description: string;
    promptText: string;
}

const PromptDisplay: React.FC<PromptDisplayProps> = ({ title, description, promptText }) => {
    const [copyStatus, setCopyStatus] = useState('Copy Prompt');

    const handleCopy = () => {
        navigator.clipboard.writeText(promptText).then(() => {
            setCopyStatus('Copied!');
            setTimeout(() => setCopyStatus('Copy Prompt'), 2000);
        }).catch(err => {
            console.error('Failed to copy: ', err);
            setCopyStatus('Failed!');
            setTimeout(() => setCopyStatus('Copy Prompt'), 2000);
        });
    };

    return (
        <div className="mb-8 p-6 bg-gray-900/50 rounded-lg border border-gray-700">
            <h3 className="text-xl font-bold text-teal-300">{title}</h3>
            <p className="mt-1 text-sm text-gray-400">{description}</p>
            <div className="relative mt-4">
                <pre className="p-4 bg-gray-900 text-gray-300 font-mono text-sm rounded-md max-h-60 overflow-auto whitespace-pre-wrap break-words">
                    <code>{promptText}</code>
                </pre>
                <button
                    onClick={handleCopy}
                    className="absolute top-2 right-2 px-3 py-1 text-xs bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 hover:text-white transition-colors"
                >
                    {copyStatus}
                </button>
            </div>
        </div>
    );
};


interface DevToolsScreenProps {
  onClose: () => void;
  supportedLanguages?: { name: string }[]; 
}

export const DevToolsScreen: React.FC<DevToolsScreenProps> = ({ onClose }) => {
    const [copyStatusAll, setCopyStatusAll] = useState('Copy All Prompts');
    const langPlaceholder = '[language]';
    
    const prompts = [
        {
            title: "Design & Processing Principles (v4.5)",
            description: "The architecture has been updated to prioritize contextual intelligence and token efficiency.",
            text: `This application operates under three fundamental principles:

1.  **Hybrid Intelligence (Flash vs. Pro Preview):** The app dynamically switches between models.
    *   **gemini-3-pro-preview** is used exclusively for tasks with high cognitive complexity: Text Cleaning (to distinguish metadata from content) and Structural Correction (Step 3).
    *   **gemini-flash-lite** is used for high-volume, low-latency tasks (OCR, Headlines, Footnotes), ensuring low cost.

2.  **Token-Aware Chunking:** Instead of splitting text by arbitrary character count, the system estimates token count to maximize context window usage (up to 2M tokens) without exceeding API output limits.

3.  **Forced Visual Integrity:** To combat hallucinations where AI "glues" titles to body text, the system uses a combination of rigid prompt instructions ("SPLIT RUN-ON HEADERS") and Regex post-processing to ensure visual line breaks.`
        },
        {
            title: "Chunking Logic & Model Selection",
            description: "To process large documents efficiently, text is 'chunked' with optimized strategies per step, and the Gemini model (Flash or Pro) is dynamically selected.",
            text: `AI has a token limit. To bypass this, the document is split using an adaptive strategy for each step, aiming to minimize API calls and costs while maintaining high quality.

**Model Selection Policy (Updated v4.5)**
*   **gemini-flash-lite-latest (MODEL_FAST):** Used for OCR, Step 1A (Headlines), and Step 1B (Footnotes). Ideal for speed.
*   **gemini-3-pro-preview (MODEL_STRICT):** The smartest available model. Mandatory for Text Cleaning and Step 3 (Correction).

**Chunking Strategies per Step**

**Text Cleaning (Pre-processing)**
*   **Model:** gemini-3-pro-preview.
*   **Strategy:** "Super-Chunks" (25k chars - Safe limit). The document is split into large pieces so the Pro model understands the broad context, but respecting the output limit.

**Step 1A (Headline Tagging)**
*   **Model:** gemini-flash-lite-latest.
*   **Strategy:** Token-based split. The system calculates tokens and creates the fewest chunks possible that fit the Flash model's safety window.

**Step 1B (Footnote Tagging)**
*   **Model:** gemini-flash-lite-latest.
*   **Strategy:** Sparse Batching. The code scans text for footnote candidates. Only those pages are sent to AI, drastically saving tokens.

**Step 2 (Content Structuring)**
*   **Model:** Hybrid. Flash by default, scales to Pro if the chunk is massive (>120k chars).
*   **Strategy:** Section Grouping (Level 1). The system attempts to send entire chapters at once to maintain semantic coherence.

**Step 3 (Structure Correction)**
*   **Model:** gemini-3-pro-preview (Always).
*   **Strategy:** Hierarchy Validation. The model scans the document correcting illogical jumps (e.g., Level 1 -> Level 3) and ensuring content is encapsulated correctly.`
        },
        {
            title: "OCR Prompt",
            description: "Used to extract text from each PDF page when normal text is undetectable. Returns verbatim text, ignoring layouts.",
            text: getOcrPromptForLanguage(langPlaceholder)
        },
        {
            title: "JSON Transformation Prompt",
            description: "Used when a JSON file is loaded. Converts JSON structure into a hierarchical, readable text document.",
            text: getTaskInstructionsForJsonTransform()
        },
        {
            title: "Language Detection Prompt",
            description: "Used in the configuration screen to analyze a snippet and suggest the document language.",
            text: getTaskInstructionsForLanguageDetection(SUPPORTED_LANGUAGES.map(l => l.name))
        },
        {
            title: "Text Cleaning Prompt (PRO MODEL)",
            description: "Strict 'Read-Only' instructions. Removes garbage (headers/footers) but FORBIDS rewriting or fixing grammar. No tags allowed.",
            text: getTaskInstructionsForCleaning(langPlaceholder)
        },
        {
            title: "Step 1A Prompt: Mark Headlines (DETERMINISTIC MERGE)",
            description: "Identifies and tags structural headlines {{level1-5}}. ENFORCES 'Level 0 Sacredness' (never touches main title) and performs 'Deterministic Lookahead Merge' to fix broken headers (e.g., 'Article 1' + 'Definitions' -> 'Article 1 Definitions').",
            text: getTaskInstructionsForStep1_Headlines(langPlaceholder)
        },
        {
            title: "Step 1B Prompt: Mark Footnotes (CONTEXT AWARE)",
            description: "Scan context blocks for {{footnotenumberX}} and {{footnoteX}}. Strictly forbids touching structural tags or headline levels. Handles spaces introduced by OCR in reference numbers.",
            text: getTaskInstructionsForStep1_Footnotes(langPlaceholder)
        },
        {
            title: "Step 2 Prompt: Structure Content (LEVEL 0 BARRIER)",
            description: "Wraps body text in {{text_level}}. Enforces the 'Level 0 Barrier' (content cannot exist directly under root title). Uses 'Relative Depth' rules to indent lists and definitions relative to their parent headline.",
            text: getTaskInstructionsForStep2_Content(langPlaceholder)
        },
        {
            title: "Step 3 Prompt: Conservative Auditor (INVARIANT CHECK)",
            description: "The 'Conservative Auditor'. If a Reference PDF is provided, it fixes structural jumps (Level 1->3). If NO reference, it acts as a layout normalizer only. STRICT INVARIANTS: Never changes text content, never removes headlines, never changes content level numbers.",
            text: getTaskInstructionsForStep3_BatchFix(langPlaceholder)
        },
        {
            title: "Translation Prompt",
            description: "Translates text to English while STRICTLY preserving all structural tags ({{levelX}}, {{text_level}}).",
            text: getTaskInstructionsForTranslation()
        },
        {
            title: "Table Linearization Prompt",
            description: "Used by the 'Specialized Table Processor'. Flatten complex PDF tables into linear key-value text.",
            text: getTableLinearizationPrompt()
        }
    ];

    const allPromptsText = prompts.map(p => 
        `# --- ${p.title} ---\n\n${p.text}`
    ).join('\n\n\n');
    
    const handleCopyAll = () => {
        navigator.clipboard.writeText(allPromptsText).then(() => {
            setCopyStatusAll('Copied!');
            setTimeout(() => setCopyStatusAll('Copy All Prompts'), 2000);
        }).catch(err => {
            console.error('Failed to copy all prompts: ', err);
            setCopyStatusAll('Failed!');
            setTimeout(() => setCopyStatusAll('Copy All Prompts'), 2000);
        });
    };

    return (
        <div className="fixed inset-0 bg-gray-900/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="w-full max-w-4xl h-[90vh] bg-gray-800 rounded-xl shadow-2xl flex flex-col">
                <header className="p-6 border-b border-gray-700 flex-shrink-0 flex justify-between items-center">
                    <div>
                        <h2 className="text-2xl font-bold text-white">Developer Prompt Panel</h2>
                        <p className="text-gray-400 text-sm">Behind-the-scenes view of how the AI (Gemini 3 Pro and Flash) is instructed.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-3xl">&times;</button>
                </header>
                
                <main className="p-6 flex-grow overflow-auto">
                    {prompts.map(p => (
                        <PromptDisplay key={p.title} title={p.title} description={p.description} promptText={p.text} />
                    ))}
                    
                    <div className="mt-8 p-6 bg-gray-900/50 rounded-lg border border-gray-700">
                        <h3 className="text-xl font-bold text-sky-300">All Prompts</h3>
                        <p className="mt-1 text-sm text-gray-400">Copy all prompts above into a single text block for full reference.</p>
                         <button
                            onClick={handleCopyAll}
                            className="mt-4 w-full px-4 py-3 bg-sky-600 text-white font-bold rounded-md hover:bg-sky-500 transition-colors"
                        >
                            {copyStatusAll}
                        </button>
                    </div>
                </main>
            </div>
        </div>
    );
};
