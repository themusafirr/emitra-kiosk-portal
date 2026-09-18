const fs = require('fs');
const { PDFDocument } = require('pdf-lib');

/**
 * Counts total pages in a PDF file or buffer.
 */
async function countPdfPages(filePathOrBuffer) {
  try {
    const buffer = typeof filePathOrBuffer === 'string'
      ? fs.readFileSync(filePathOrBuffer)
      : filePathOrBuffer;

    const pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    return pdfDoc.getPageCount();
  } catch (error) {
    console.error('Error counting PDF pages:', error);
    throw new Error(`Could not parse PDF pages: ${error.message}`);
  }
}

/**
 * Converts a standard image buffer (JPEG/PNG) into a single-page A4 PDF buffer.
 */
async function imageToA4Pdf(imageBuffer, mimeType = 'image/jpeg') {
  const pdfDoc = await PDFDocument.create();
  // Standard A4 dimensions in points: 595.28 x 841.89
  const page = pdfDoc.addPage([595.28, 841.89]);

  let image;
  if (mimeType.includes('png')) {
    image = await pdfDoc.embedPng(imageBuffer);
  } else {
    image = await pdfDoc.embedJpg(imageBuffer);
  }

  const { width, height } = image.scale(1);
  const pageWidth = 595.28;
  const pageHeight = 841.89;

  // Fit image proportionally within 20pt margins
  const margin = 20;
  const maxW = pageWidth - margin * 2;
  const maxH = pageHeight - margin * 2;

  const scale = Math.min(maxW / width, maxH / height, 1.0);
  const renderW = width * scale;
  const renderH = height * scale;

  const x = (pageWidth - renderW) / 2;
  const y = (pageHeight - renderH) / 2;

  page.drawImage(image, {
    x,
    y,
    width: renderW,
    height: renderH,
  });

  return await pdfDoc.save();
}

module.exports = {
  countPdfPages,
  imageToA4Pdf
};
