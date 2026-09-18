const QRCode = require('qrcode');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Generates a ready-to-print A4 Counter Standee PDF for the e-Mitra shop.
 */
async function generateShopStandeePdf(shop, baseUrl = 'http://localhost:5000') {
  const shopUrl = `${baseUrl}/?shop=${shop.shop_id}`;

  // 1. Generate QR code PNG buffer
  const qrPngBuffer = await QRCode.toBuffer(shopUrl, {
    errorCorrectionLevel: 'H',
    margin: 2,
    width: 600,
    color: {
      dark: '#0f172a',
      light: '#ffffff'
    }
  });

  // 2. Create A4 PDF (595.28 x 841.89 points)
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();

  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const qrImage = await pdfDoc.embedPng(qrPngBuffer);

  // Background header band (Dark Slate Blue)
  page.drawRectangle({
    x: 0,
    y: height - 120,
    width: width,
    height: 120,
    color: rgb(0.08, 0.12, 0.28)
  });

  // Header Title
  const title = "SELF-SERVICE PRINT KIOSK";
  const titleWidth = fontBold.widthOfTextAtSize(title, 24);
  page.drawText(title, {
    x: (width - titleWidth) / 2,
    y: height - 55,
    size: 24,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  // Subtitle
  const subtitle = "Scan QR  *  Upload Document  *  Instant Self-Print";
  const subWidth = fontRegular.widthOfTextAtSize(subtitle, 13);
  page.drawText(subtitle, {
    x: (width - subWidth) / 2,
    y: height - 85,
    size: 13,
    font: fontRegular,
    color: rgb(0.85, 0.90, 1.0)
  });

  // Shop Name Box
  page.drawRectangle({
    x: 40,
    y: height - 200,
    width: width - 80,
    height: 60,
    color: rgb(0.95, 0.97, 1.0),
    borderColor: rgb(0.80, 0.85, 0.95),
    borderWidth: 1.5
  });

  const shopName = shop.name || "Authorized e-Mitra Center";
  const shopNameWidth = fontBold.widthOfTextAtSize(shopName, 18);
  page.drawText(shopName, {
    x: (width - shopNameWidth) / 2,
    y: height - 170,
    size: 18,
    font: fontBold,
    color: rgb(0.12, 0.22, 0.55)
  });

  const shopAddress = `${shop.address || 'Rajasthan'}  |  Shop ID: #${shop.shop_id}`;
  const addrWidth = fontRegular.widthOfTextAtSize(shopAddress, 10);
  page.drawText(shopAddress, {
    x: (width - addrWidth) / 2,
    y: height - 190,
    size: 10,
    font: fontRegular,
    color: rgb(0.4, 0.45, 0.55)
  });

  // Center QR Code Frame
  const qrSize = 260;
  const qrX = (width - qrSize) / 2;
  const qrY = height - 500;

  // Outer border around QR
  page.drawRectangle({
    x: qrX - 15,
    y: qrY - 15,
    width: qrSize + 30,
    height: qrSize + 30,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.15, 0.35, 0.85),
    borderWidth: 2
  });

  page.drawImage(qrImage, {
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize
  });

  // "SCAN HERE WITH ANY CAMERA" callout badge below QR
  const scanCallout = "SCAN HERE TO PRINT (PHONE CAMERA / GOOGLE LENS)";
  const calloutWidth = fontBold.widthOfTextAtSize(scanCallout, 12);
  page.drawRectangle({
    x: (width - calloutWidth - 30) / 2,
    y: qrY - 45,
    width: calloutWidth + 30,
    height: 28,
    color: rgb(0.9, 0.2, 0.2) // Attention red/amber badge
  });
  page.drawText(scanCallout, {
    x: (width - calloutWidth) / 2,
    y: qrY - 37,
    size: 12,
    font: fontBold,
    color: rgb(1, 1, 1)
  });

  // 3-Step Instructions Box
  const stepY = qrY - 150;
  page.drawRectangle({
    x: 40,
    y: stepY,
    width: width - 80,
    height: 90,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: rgb(0.9, 0.92, 0.95),
    borderWidth: 1
  });

  const step1 = "Step 1: Scan this QR code from your smartphone (No app needed).";
  const step2 = "Step 2: Select PDF or Aadhaar/ID photo & choose B&W or Color.";
  const step3 = "Step 3: Pay via UPI / PhonePe / Paytm - Machine will print automatically!";

  page.drawText(step1, { x: 60, y: stepY + 65, size: 11, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });
  page.drawText(step2, { x: 60, y: stepY + 45, size: 11, font: fontRegular, color: rgb(0.2, 0.25, 0.35) });
  page.drawText(step3, { x: 60, y: stepY + 25, size: 11, font: fontBold, color: rgb(0.1, 0.5, 0.2) });

  // Rate Card Strip
  const rates = shop.rates || {};
  const rateText = `Rates: B&W: Rs. ${rates.bw_single || 2}/page   |   Color: Rs. ${rates.color_single || 10}/page   |   ID Card Xerox: Rs. ${rates.id_card || 10}/sheet`;
  const rateWidth = fontBold.widthOfTextAtSize(rateText, 11);
  page.drawText(rateText, {
    x: (width - rateWidth) / 2,
    y: stepY - 25,
    size: 11,
    font: fontBold,
    color: rgb(0.15, 0.25, 0.45)
  });

  // Footer Privacy Banner
  page.drawRectangle({
    x: 0,
    y: 0,
    width: width,
    height: 40,
    color: rgb(0.08, 0.12, 0.28)
  });

  const footerText = "100% PRIVACY GUARANTEE: Files are automatically destroyed immediately post-print.";
  const footerWidth = fontRegular.widthOfTextAtSize(footerText, 9);
  page.drawText(footerText, {
    x: (width - footerWidth) / 2,
    y: 15,
    size: 9,
    font: fontRegular,
    color: rgb(0.8, 0.85, 0.95)
  });

  return await pdfDoc.save();
}

module.exports = {
  generateShopStandeePdf
};
