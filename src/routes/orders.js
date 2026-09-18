const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const { countPdfPages, imageToA4Pdf } = require('../services/pdfService');
const { isHeic, ensureJpegBuffer, generateIdCardA4Composite } = require('../services/imageService');
const { createRazorpayOrder, verifyPaymentSignature } = require('../services/paymentService');
const { readShops, readJobs, writeJobs } = require('../db');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer storage
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// POST /api/upload - Single document upload with dynamic PDF page counting & HEIC conversion
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const originalName = req.file.originalname;
    const fileExt = path.extname(originalName).toLowerCase();
    const fileId = uuidv4();
    let pageCount = 1;
    let savedPdfPath = '';
    let previewUrl = '';

    if (fileExt === '.pdf') {
      // PDF document
      pageCount = await countPdfPages(req.file.buffer);
      savedPdfPath = path.join(UPLOADS_DIR, `${fileId}.pdf`);
      fs.writeFileSync(savedPdfPath, req.file.buffer);
      previewUrl = `/uploads/${fileId}.pdf`;
    } else if (fileExt === '.txt') {
      // Notepad / Plain text
      const { textToA4Pdf } = require('../services/docConverterService');
      const conv = await textToA4Pdf(req.file.buffer, originalName);
      savedPdfPath = path.join(UPLOADS_DIR, `${fileId}.pdf`);
      fs.writeFileSync(savedPdfPath, conv.pdfBuffer);
      pageCount = conv.pages;
      previewUrl = `/uploads/${fileId}.pdf`;
    } else if (fileExt === '.docx' || fileExt === '.doc') {
      // Microsoft Word document
      const { docxToA4Pdf } = require('../services/docConverterService');
      const conv = await docxToA4Pdf(req.file.buffer, originalName);
      savedPdfPath = path.join(UPLOADS_DIR, `${fileId}.pdf`);
      fs.writeFileSync(savedPdfPath, conv.pdfBuffer);
      pageCount = conv.pages;
      previewUrl = `/uploads/${fileId}.pdf`;
    } else if (fileExt === '.xlsx' || fileExt === '.xls' || fileExt === '.csv') {
      // Microsoft Excel / Spreadsheet / CSV
      const { excelToA4Pdf } = require('../services/docConverterService');
      const conv = await excelToA4Pdf(req.file.buffer, originalName);
      savedPdfPath = path.join(UPLOADS_DIR, `${fileId}.pdf`);
      fs.writeFileSync(savedPdfPath, conv.pdfBuffer);
      pageCount = conv.pages;
      previewUrl = `/uploads/${fileId}.pdf`;
    } else {
      // Photos (Gallery / Camera / iPhone HEIC / JPG / PNG / WebP)
      const jpegBuffer = await ensureJpegBuffer(req.file.buffer, originalName);
      const previewJpgPath = path.join(UPLOADS_DIR, `${fileId}_preview.jpg`);
      fs.writeFileSync(previewJpgPath, jpegBuffer);
      previewUrl = `/uploads/${fileId}_preview.jpg`;

      // Convert photo to standard A4 PDF for silent printing
      const a4PdfBuffer = await imageToA4Pdf(jpegBuffer, 'image/jpeg');
      savedPdfPath = path.join(UPLOADS_DIR, `${fileId}.pdf`);
      fs.writeFileSync(savedPdfPath, a4PdfBuffer);
      pageCount = 1;
    }

    res.json({
      file_id: fileId,
      file_name: originalName,
      pages: pageCount,
      file_url: `/uploads/${fileId}.pdf`,
      preview_url: previewUrl,
      size_bytes: req.file.size
    });
  } catch (err) {
    console.error('File upload processing error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/merge-id-card - ID Card Xerox Auto-Merge (Front + Back)
router.post('/merge-id-card', upload.fields([
  { name: 'front', maxCount: 1 },
  { name: 'back', maxCount: 1 }
]), async (req, res) => {
  try {
    if (!req.files || !req.files['front'] || !req.files['back']) {
      return res.status(400).json({ error: "Both Front and Back photos of the ID card are required." });
    }

    const frontFile = req.files['front'][0];
    const backFile = req.files['back'][0];
    const fileId = uuidv4();

    console.log(`[ID CARD MERGE] Merging Front (${frontFile.originalname}) and Back (${backFile.originalname})...`);

    const { imagePreviewBuffer, pdfBuffer } = await generateIdCardA4Composite(
      frontFile.buffer,
      backFile.buffer,
      frontFile.originalname,
      backFile.originalname
    );

    // Save A4 preview image & print PDF
    const previewPath = path.join(UPLOADS_DIR, `${fileId}_id_preview.jpg`);
    const pdfPath = path.join(UPLOADS_DIR, `${fileId}.pdf`);

    fs.writeFileSync(previewPath, imagePreviewBuffer);
    fs.writeFileSync(pdfPath, pdfBuffer);

    res.json({
      file_id: fileId,
      file_name: `ID_Card_A4_${Date.now()}.pdf`,
      pages: 1,
      type: 'id_card',
      file_url: `/uploads/${fileId}.pdf`,
      preview_url: `/uploads/${fileId}_id_preview.jpg`
    });
  } catch (err) {
    console.error('ID Card merge failed:', err);
    res.status(500).json({ error: `ID Card merge error: ${err.message}` });
  }
});

// POST /api/orders/passport-photos - 8-in-1 Passport Photo Sheet Generator
router.post('/passport-photos', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Passport photo is required." });
    }

    const { generatePassportPhotoSheet } = require('../services/docConverterService');
    const fileId = uuidv4();
    const { imagePreviewBuffer, pdfBuffer } = await generatePassportPhotoSheet(req.file.buffer, req.file.originalname);

    const previewPath = path.join(UPLOADS_DIR, `${fileId}_passport_preview.jpg`);
    const pdfPath = path.join(UPLOADS_DIR, `${fileId}.pdf`);

    fs.writeFileSync(previewPath, imagePreviewBuffer);
    fs.writeFileSync(pdfPath, pdfBuffer);

    res.json({
      file_id: fileId,
      file_name: `Passport_Photos_8in1_${Date.now()}.pdf`,
      pages: 1,
      type: 'passport_photos',
      file_url: `/uploads/${fileId}.pdf`,
      preview_url: `/uploads/${fileId}_passport_preview.jpg`
    });
  } catch (err) {
    console.error('Passport photo sheet generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/checkout - Calculates exact bill based on pages and rates, creates Razorpay order
router.post('/checkout', async (req, res) => {
  try {
    const { shop_id, customer_phone, items } = req.body;

    if (!shop_id || !items || !items.length) {
      return res.status(400).json({ error: "shop_id and items are required" });
    }

    const shops = readShops();
    const shop = shops[shop_id];

    if (!shop) {
      return res.status(404).json({ error: "Shop not found" });
    }

    // Hardware status check before taking payment:
    // If shopkeeper PC is offline or printer is out of paper, reject payment early!
    const isHeartbeatRecent = shop.last_heartbeat && (Date.now() - shop.last_heartbeat < 45000);
    if (!isHeartbeatRecent && !req.body.bypass_hardware_check) {
      return res.status(503).json({
        error: "Dukan ka Print Server abhi Offline hai. Payment accept nahi ki ja sakti.",
        status_code: "SHOP_OFFLINE"
      });
    }

    if (shop.printer && !shop.printer.is_ready && !req.body.bypass_hardware_check) {
      return res.status(503).json({
        error: `Printer abhi ready nahi hai: ${shop.printer.message}`,
        status_code: "PRINTER_NOT_READY"
      });
    }

    const rates = shop.rates || {
      bw_single: 2.0,
      bw_duplex: 3.0,
      color_single: 10.0,
      color_duplex: 18.0,
      id_card: 10.0
    };

    let totalAmount = 0;
    const computedItems = items.map(item => {
      const copies = item.copies || 1;
      const pages = item.pages || 1;
      const isColor = !!item.color;
      const isDuplex = !!item.duplex;
      const isIdCard = item.type === 'id_card';

      let ratePerPage = 0;
      if (isIdCard) {
        ratePerPage = rates.id_card || 10.0;
      } else if (isColor) {
        ratePerPage = isDuplex ? rates.color_duplex : rates.color_single;
      } else {
        ratePerPage = isDuplex ? rates.bw_duplex : rates.bw_single;
      }

      // If duplex, 2 pages count as 1 sheet rate
      const effectiveUnits = isDuplex ? Math.ceil(pages / 2) : pages;
      const itemCost = effectiveUnits * ratePerPage * copies;
      totalAmount += itemCost;

      return {
        ...item,
        rate_per_unit: ratePerPage,
        item_total: itemCost
      };
    });

    const orderReceipt = `rcpt_${Date.now()}`;
    const rzpOrder = await createRazorpayOrder(shop, totalAmount, orderReceipt);

    const newJob = {
      order_id: rzpOrder.order_id,
      receipt_id: orderReceipt,
      shop_id: shop_id,
      customer_phone: customer_phone || '',
      items: computedItems,
      total_amount: totalAmount,
      currency: 'INR',
      status: 'PENDING_PAYMENT',
      created_at: Date.now(),
      paid_at: null,
      printed_at: null
    };

    const jobs = readJobs();
    jobs.push(newJob);
    writeJobs(jobs);
    const QRCode = require('qrcode');
    const shopUpiId = shop.upi_id || 'sharma.emitra@okaxis';
    const upiUri = `upi://pay?pa=${encodeURIComponent(shopUpiId)}&pn=${encodeURIComponent(shop.name)}&am=${totalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent('PrintOrder_' + orderReceipt)}`;
    const upiQrDataUrl = await QRCode.toDataURL(upiUri, { width: 300, margin: 1 });

    res.json({
      order_id: rzpOrder.order_id,
      amount: rzpOrder.amount, // in paise
      currency: rzpOrder.currency,
      total_amount_rupees: totalAmount,
      items: computedItems,
      razorpay_key_id: (shop.razorpay?.key_id && !shop.razorpay.key_id.includes('sample'))
        ? shop.razorpay.key_id
        : (process.env.RAZORPAY_KEY_ID || 'rzp_test_mock'),
      is_mock: rzpOrder.is_mock,
      upi_id: shopUpiId,
      upi_uri: upiUri,
      upi_qr: upiQrDataUrl
    });
  } catch (err) {
    console.error('Checkout creation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/orders/verify - Verifies payment and queues print job
router.post('/verify', (req, res) => {
  const { order_id, razorpay_payment_id, razorpay_signature, shop_id } = req.body;

  const shops = readShops();
  const shop = shops[shop_id];
  const jobs = readJobs();
  const job = jobs.find(j => j.order_id === order_id);

  if (!job) {
    return res.status(404).json({ error: "Order not found" });
  }

  const isValid = verifyPaymentSignature(shop, order_id, razorpay_payment_id, razorpay_signature);
  if (!isValid) {
    return res.status(400).json({ error: "Invalid payment signature" });
  }

  job.status = 'PAID';
  job.payment_id = razorpay_payment_id || `pay_mock_${Date.now()}`;
  job.paid_at = Date.now();
  writeJobs(jobs);

  console.log(`[PAYMENT VERIFIED] Order ${order_id} is PAID! Ready for desktop agent print spooling.`);

  res.json({
    success: true,
    order_id: job.order_id,
    status: job.status,
    message: "Payment verified successfully. Your document is being printed!"
  });
});

// GET /api/orders/:orderId/status - Live tracking for customer PWA
router.get('/:orderId/status', (req, res) => {
  const { orderId } = req.params;
  const jobs = readJobs();
  const job = jobs.find(j => j.order_id === orderId);

  if (!job) {
    return res.status(404).json({ error: "Order not found" });
  }

  res.json({
    order_id: job.order_id,
    shop_id: job.shop_id,
    status: job.status,
    total_amount: job.total_amount,
    items_count: job.items?.length || 0,
    created_at: job.created_at,
    paid_at: job.paid_at,
    printed_at: job.printed_at,
    refund_info: job.refund_info || null
  });
});

module.exports = router;
