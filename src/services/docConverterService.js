const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const mammoth = require('mammoth');
const XLSX = require('xlsx');
const sharp = require('sharp');
const { ensureJpegBuffer } = require('./imageService');

/**
 * Converts plain text / Notepad content to multi-page A4 PDF.
 */
async function textToA4Pdf(textBuffer, title = 'Document') {
  const text = textBuffer.toString('utf-8');
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const fontSize = 11;
  const lineHeight = 16;
  const margin = 50;
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const maxWidth = pageWidth - (margin * 2);
  const maxLinesPerPage = Math.floor((pageHeight - (margin * 2) - 40) / lineHeight);

  // Split text into wrapped lines
  const rawLines = text.split(/\r?\n/);
  const wrappedLines = [];

  for (const rawLine of rawLines) {
    if (!rawLine.trim()) {
      wrappedLines.push('');
      continue;
    }
    const words = rawLine.split(' ');
    let currentLine = '';
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const testWidth = font.widthOfTextAtSize(testLine, fontSize);
      if (testWidth <= maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) wrappedLines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) wrappedLines.push(currentLine);
  }

  // Create pages
  const totalPages = Math.max(1, Math.ceil(wrappedLines.length / maxLinesPerPage));

  for (let p = 0; p < totalPages; p++) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    const linesForPage = wrappedLines.slice(p * maxLinesPerPage, (p + 1) * maxLinesPerPage);

    // Header title
    page.drawText(title.substring(0, 50), {
      x: margin,
      y: pageHeight - margin + 10,
      size: 9,
      font: fontBold,
      color: rgb(0.4, 0.4, 0.4)
    });

    // Page number
    const pageStr = `Page ${p + 1} of ${totalPages}`;
    const pWidth = font.widthOfTextAtSize(pageStr, 9);
    page.drawText(pageStr, {
      x: pageWidth - margin - pWidth,
      y: pageHeight - margin + 10,
      size: 9,
      font: font,
      color: rgb(0.4, 0.4, 0.4)
    });

    let y = pageHeight - margin - 20;
    for (const line of linesForPage) {
      if (line) {
        page.drawText(line, {
          x: margin,
          y,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1)
        });
      }
      y -= lineHeight;
    }
  }

  return {
    pdfBuffer: Buffer.from(await pdfDoc.save()),
    pages: totalPages
  };
}

/**
 * Converts Word (.docx) to A4 PDF using text extraction.
 */
async function docxToA4Pdf(docxBuffer, originalName = 'Document.docx') {
  try {
    const result = await mammoth.extractRawText({ buffer: docxBuffer });
    const text = result.value || 'Empty Word Document';
    return await textToA4Pdf(Buffer.from(text, 'utf-8'), originalName);
  } catch (err) {
    console.warn('Mammoth docx parse error, fallback to raw text:', err);
    return await textToA4Pdf(docxBuffer, originalName);
  }
}

/**
 * Converts Excel (.xlsx, .xls, .csv) to A4 PDF.
 */
async function excelToA4Pdf(excelBuffer, originalName = 'Spreadsheet.xlsx') {
  try {
    const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
    let combinedText = '';

    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      combinedText += `--- Sheet: ${sheetName} ---\n` + csv + '\n\n';
    });

    return await textToA4Pdf(Buffer.from(combinedText, 'utf-8'), originalName);
  } catch (err) {
    console.warn('Excel parse error:', err);
    return await textToA4Pdf(Buffer.from('Could not parse spreadsheet', 'utf-8'), originalName);
  }
}

/**
 * Generates an 8-in-1 Passport Photo Sheet on A4 canvas (300 DPI).
 * Standard Indian passport photo ratio: 3.5cm x 4.5cm (~413 x 531 px @ 300 DPI).
 */
async function generatePassportPhotoSheet(imageBuffer, originalName = 'photo.jpg') {
  const normalizedJpeg = await ensureJpegBuffer(imageBuffer, originalName);

  // Standard Indian passport size: 413 x 531 pixels (3.5cm x 4.5cm at 300 DPI)
  const PHOTO_W = 413;
  const PHOTO_H = 531;

  // Crop & resize image to exact passport dimensions with white border
  const singlePassportPhoto = await sharp(normalizedJpeg)
    .resize(PHOTO_W - 8, PHOTO_H - 8, { fit: 'cover', position: 'top' })
    .extend({
      top: 4,
      bottom: 4,
      left: 4,
      right: 4,
      background: { r: 255, g: 255, b: 255 }
    })
    .toBuffer();

  // Standard A4 Canvas at 300 DPI: 2480 x 3508 pixels
  const CANVAS_W = 2480;
  const CANVAS_H = 3508;

  // Lay out 8 passport photos: 2 rows of 4 columns centered
  const COLS = 4;
  const ROWS = 2;
  const GAP_X = 60;
  const GAP_Y = 60;

  const totalGridWidth = (COLS * PHOTO_W) + ((COLS - 1) * GAP_X);
  const totalGridHeight = (ROWS * PHOTO_H) + ((ROWS - 1) * GAP_Y);

  const startX = Math.floor((CANVAS_W - totalGridWidth) / 2);
  const startY = 600; // Place in upper half for convenient cutting

  const composites = [];

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = startX + (c * (PHOTO_W + GAP_X));
      const y = startY + (r * (PHOTO_H + GAP_Y));
      composites.push({
        input: singlePassportPhoto,
        top: y,
        left: x
      });
    }
  }

  // Composite 8 photos onto blank A4 canvas
  const passportSheetJpeg = await sharp({
    create: {
      width: CANVAS_W,
      height: CANVAS_H,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
    .composite(composites)
    .jpeg({ quality: 95 })
    .toBuffer();

  // Convert to 1-page A4 PDF for printing
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const embeddedJpg = await pdfDoc.embedJpg(passportSheetJpeg);

  page.drawImage(embeddedJpg, {
    x: 0,
    y: 0,
    width: 595.28,
    height: 841.89
  });

  return {
    imagePreviewBuffer: passportSheetJpeg,
    pdfBuffer: Buffer.from(await pdfDoc.save()),
    pages: 1
  };
}

module.exports = {
  textToA4Pdf,
  docxToA4Pdf,
  excelToA4Pdf,
  generatePassportPhotoSheet
};
