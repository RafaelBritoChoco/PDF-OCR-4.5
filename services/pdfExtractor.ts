import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist/types/src/display/api';

/**
 * Loads a PDF file and returns the PDF.js document object.
 * This should be used instead of calling pdfjs.getDocument directly in components.
 * @param file The PDF file.
 * @returns A promise that resolves with the PDFDocumentProxy object.
 */
export const loadPdfDocument = async (file: File): Promise<PDFDocumentProxy> => {
    const arrayBuffer = await file.arrayBuffer();
    const pdfDocument = await pdfjs.getDocument(arrayBuffer).promise;
    return pdfDocument;
};

/**
 * Quickly reads a PDF file to get the total number of pages.
 * @param file The PDF file.
 * @returns A promise that resolves with the number of pages.
 */
export const getPdfPageCount = async (file: File): Promise<number> => {
  try {
    const pdfDocument = await loadPdfDocument(file);
    return pdfDocument.numPages;
  } catch (error) {
    console.error("Could not read PDF for page count:", error);
    return 0; // Return 0 if the PDF is unreadable
  }
};


/**
 * Extracts text content from a PDF file using pdf.js.
 * This function runs entirely in the browser, ensuring user privacy.
 * @param file The PDF file to process.
 * @param onProgress A callback function to report extraction progress (0-100).
 * @returns A promise that resolves with the extracted text content.
 */
export const extractTextFromFile = async (
  file: File,
  onProgress: (progress: number) => void
): Promise<string> => {
  console.log(`Starting real text extraction for: ${file.name}`);
  onProgress(0);

  // Load the PDF document
  const pdfDocument = await loadPdfDocument(file);
  const numPages = pdfDocument.numPages;
  const allPagesText: string[] = [];

  // Iterate through each page and extract text
  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDocument.getPage(i);
    const textContent = await page.getTextContent();
    
    // Join the text items on the page
    const pageText = textContent.items
      .map(item => 'str' in item ? item.str : '')
      .filter(str => str.trim().length > 0) // Filter out empty strings to avoid double spaces
      .join(' '); // Join with a single space
    
    allPagesText.push(pageText);

    // Report progress after each page is processed
    const progress = Math.round((i / numPages) * 100);
    onProgress(progress);
  }

  // Join with a clear page break marker to give the AI context
  const fullText = allPagesText.join('\n\n--- PAGE BREAK ---\n\n');

  console.log(`Finished text extraction for: ${file.name}`);
  if (!fullText.trim()) {
    return "No text could be extracted from this PDF. It might be an image-only PDF, which requires an OCR process not available in this client-side version.";
  }
  return fullText.trim();
};