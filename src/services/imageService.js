const sharp = require('sharp');
const heicConvert = require('heic-convert');
const { imageToA4Pdf } = require('./pdfService');

/**
 * Checks if a buffer or filename represents an iPhone HEIC/HEIF image.
 */
function isHeic(buffer, filename = '') {
  if (filename.toLowerCase().endsWith('.heic') || filename.toLowerCase().endsWith('.heif')) {
    return true;
  }
  // Check magic bytes (ftypheic or ftypmif1 at offset 4)
  if (buffer && buffer.length > 12) {
    const magic = buffer.toString('utf8', 4, 12);
    if (magic.includes('ftyp') && (magic.includes('heic') || magic.includes('mif1') || magic.includes('hevc'))) {
      return true;
    }
  }
  return false;
}

/**
 * Converts HEIC/HEIF buffer to JPEG buffer automatically.
 */
async function ensureJpegBuffer(buffer, filename = '') {
  if (isHeic(buffer, filename)) {
    console.log(`[HEIC CONVERTER] Detected iPhone HEIC file (${filename}), converting to JPEG...`);
    const outputBuffer = await heicConvert({
      buffer: buffer,
      format: 'JPEG',
      quality: 0.92
    });
    return Buffer.from(outputBuffer);
  }

  // Ensure image is normalized (auto-rotated based on EXIF)
  return await sharp(buffer)
    .rotate() // Auto-orient based on EXIF tag
    .jpeg({ quality: 92 })
    .toBuffer();
}

/**
 * ID Card Auto-Merge (Aadhaar, Voter ID, Driving License)
 * Standard A4 canvas at 300 DPI: 2480 x 3508 pixels
 * Standard CR80 Card Size: 85.6mm x 53.98mm => 1011 x 638 pixels at 300 DPI.
 * Composites Front and Back side aligned vertically with cutting guide marks.
 */
async function generateIdCardA4Composite(frontBuffer, backBuffer, frontFilename = '', backFilename = '') {
  const normFront = await ensureJpegBuffer(frontBuffer, frontFilename);
  const normBack = await ensureJpegBuffer(backBuffer, backFilename);

  const A4_WIDTH = 2480;
  const A4_HEIGHT = 3508;

  // Standard Indian ID card dimensions @ 300 DPI
  const CARD_WIDTH = 1012;
  const CARD_HEIGHT = 638;

  // Process Front card: resize to standard aspect ratio, add subtle 2px border
  const frontCard = await sharp(normFront)
    .resize(CARD_WIDTH, CARD_HEIGHT, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .extend({
      top: 2,
      bottom: 2,
      left: 2,
      right: 2,
      background: '#D1D5DB' // Light grey cutting border
    })
    .toBuffer();

  // Process Back card
  const backCard = await sharp(normBack)
    .resize(CARD_WIDTH, CARD_HEIGHT, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .extend({
      top: 2,
      bottom: 2,
      left: 2,
      right: 2,
      background: '#D1D5DB'
    })
    .toBuffer();

  // Positioning:
  // Center horizontally
  const leftX = Math.round((A4_WIDTH - (CARD_WIDTH + 4)) / 2);
  // Front card on upper section
  const frontY = 480;
  // Back card directly below front with standard photocopier margin
  const backY = frontY + CARD_HEIGHT + 240;

  // Render high-res A4 composite
  const compositeJpg = await sharp({
    create: {
      width: A4_WIDTH,
      height: A4_HEIGHT,
      channels: 3,
      background: { r: 255, g: 255, b: 255 }
    }
  })
    .composite([
      { input: frontCard, top: frontY, left: leftX },
      { input: backCard, top: backY, left: leftX }
    ])
    .jpeg({ quality: 95 })
    .toBuffer();

  // Convert A4 image buffer to standardized A4 PDF buffer ready for silent spooling
  const pdfBuffer = await imageToA4Pdf(compositeJpg, 'image/jpeg');

  return {
    imagePreviewBuffer: compositeJpg,
    pdfBuffer: pdfBuffer
  };
}

module.exports = {
  isHeic,
  ensureJpegBuffer,
  generateIdCardA4Composite
};
