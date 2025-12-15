export type DiffResult = {
  type: 'added' | 'removed' | 'common';
  line: string;
};

/**
 * Computes the Longest Common Subsequence (LCS) table for two arrays of strings (lines).
 * This is a foundational step for the diffing algorithm.
 * @param a The first array of strings.
 * @param b The second array of strings.
 * @returns A 2D array (matrix) representing the LCS lengths.
 */
const computeLcsTable = (a: string[], b: string[]): number[][] => {
  const table = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }
  return table;
};

/**
 * Generates a line-by-line diff between two strings using an LCS-based algorithm.
 * It backtracks through the LCS table to determine which lines were added, removed, or are common.
 * @param oldText The original text.
 * @param newText The modified text.
 * @returns An array of DiffResult objects representing the changes.
 */
export const generateDiff = (oldText: string, newText: string): DiffResult[] => {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const lcsTable = computeLcsTable(oldLines, newLines);
  const diff: DiffResult[] = [];

  let i = oldLines.length;
  let j = newLines.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      // Common line
      diff.unshift({ type: 'common', line: oldLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcsTable[i][j - 1] >= lcsTable[i - 1][j])) {
      // Line added in new text
      diff.unshift({ type: 'added', line: newLines[j - 1] });
      j--;
    } else if (i > 0 && (j === 0 || lcsTable[i][j - 1] < lcsTable[i - 1][j])) {
      // Line removed from old text
      diff.unshift({ type: 'removed', line: oldLines[i - 1] });
      i--;
    } else {
      break; // Should not happen
    }
  }

  return diff;
};