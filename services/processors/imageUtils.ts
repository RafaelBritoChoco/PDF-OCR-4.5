
import * as pdfjs from "pdfjs-dist";

/**
 * Renders a PDF page to a Base64 JPEG string.
 * Used for vision-based OCR.
 */
export const renderPageToJpegBase64 = async (page: pdfjs.PDFPageProxy): Promise<string | null> => {
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
