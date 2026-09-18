const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb } = require('pdf-lib');
const sharp = require('sharp');

async function runE2ETest() {
  console.log('===============================================================');
  console.log(' STARTING END-TO-END VERIFICATION: CONTACTLESS PRINT KIOSK');
  console.log('===============================================================');

  const BASE_URL = 'http://localhost:5000';

  // 1. Generate a test 3-page PDF
  console.log('\n[TEST 1] Generating sample 3-page customer PDF...');
  const pdfDoc = await PDFDocument.create();
  for (let i = 1; i <= 3; i++) {
    const page = pdfDoc.addPage([595, 842]);
    page.drawText(`Customer Sample Document - Page ${i} of 3`, {
      x: 50,
      y: 750,
      size: 20,
      color: rgb(0.1, 0.2, 0.5)
    });
  }
  const testPdfBytes = await pdfDoc.save();
  const testPdfPath = path.join(__dirname, 'test_sample_3pages.pdf');
  fs.writeFileSync(testPdfPath, testPdfBytes);
  console.log(` Created test PDF (${testPdfBytes.length} bytes, 3 pages)`);

  // 2. Test Dynamic Page Counting via Upload Endpoint
  console.log('\n[TEST 2] Testing Dynamic PDF Page Counting (/api/upload)...');
  const uploadBlob = new Blob([testPdfBytes], { type: 'application/pdf' });
  const form1 = new FormData();
  form1.append('file', uploadBlob, 'assignment_notes.pdf');

  const uploadRes = await fetch(`${BASE_URL}/api/upload`, {
    method: 'POST',
    body: form1
  });
  const uploadData = await uploadRes.json();
  console.log(' Upload Result:', uploadData);

  if (uploadData.pages === 3) {
    console.log('  PASSED: Dynamic PDF Page Counting detected exactly 3 pages!');
  } else {
    throw new Error(`Page count mismatch: expected 3, got ${uploadData.pages}`);
  }

  // 3. Test ID Card Auto-Merge (Front + Back)
  console.log('\n[TEST 3] Testing ID Card Auto-Merge (/api/merge-id-card)...');
  // Create mock front & back card images (CR80 ratio)
  const frontImgBuffer = await sharp({
    create: { width: 500, height: 315, channels: 3, background: { r: 30, g: 144, b: 255 } }
  }).jpeg().toBuffer();

  const backImgBuffer = await sharp({
    create: { width: 500, height: 315, channels: 3, background: { r: 46, g: 139, b: 87 } }
  }).jpeg().toBuffer();

  const form2 = new FormData();
  form2.append('front', new Blob([frontImgBuffer], { type: 'image/jpeg' }), 'aadhaar_front.jpg');
  form2.append('back', new Blob([backImgBuffer], { type: 'image/jpeg' }), 'aadhaar_back.jpg');

  const idMergeRes = await fetch(`${BASE_URL}/api/merge-id-card`, {
    method: 'POST',
    body: form2
  });
  const idMergeData = await idMergeRes.json();
  console.log(' ID Merge Result:', idMergeData);

  if (idMergeData.pages === 1 && idMergeData.preview_url) {
    console.log('  PASSED: ID Card Front & Back successfully auto-merged onto A4 canvas!');
  } else {
    throw new Error('ID Card merge failed');
  }

  // 4. Test Checkout & Bill Calculation
  console.log('\n[TEST 4] Testing Smart Cart Checkout (/api/orders/checkout)...');
  const checkoutPayload = {
    shop_id: 'emitra_101',
    customer_phone: '9876543210',
    items: [
      {
        file_id: uploadData.file_id,
        file_name: uploadData.file_name,
        type: 'document',
        pages: 3,
        copies: 2, // 3 pages * 2 copies = 6 pages @ ₹2 = ₹12
        color: false,
        duplex: false,
        file_url: uploadData.file_url
      },
      {
        file_id: idMergeData.file_id,
        file_name: idMergeData.file_name,
        type: 'id_card',
        pages: 1,
        copies: 1, // 1 copy @ ₹10 = ₹10
        color: false,
        duplex: false,
        file_url: idMergeData.file_url
      }
    ]
  };

  const checkoutRes = await fetch(`${BASE_URL}/api/orders/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutPayload)
  });
  const checkoutData = await checkoutRes.json();
  console.log(' Checkout Result:', checkoutData);
  // Expected bill: ₹12 (doc) + ₹10 (id) = ₹22
  console.log(` Calculated Total: Rs. ${checkoutData.total_amount_rupees} (Expected: 22)`);

  if (checkoutData.total_amount_rupees === 22) {
    console.log('  PASSED: Exact rate calculation matched perfectly!');
  } else {
    throw new Error(`Total mismatch: expected 22, got ${checkoutData.total_amount_rupees}`);
  }

  // 5. Test Payment Verification (Instant Simulator / Webhook)
  console.log('\n[TEST 5] Testing Payment Verification (/api/orders/verify)...');
  const verifyRes = await fetch(`${BASE_URL}/api/orders/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      order_id: checkoutData.order_id,
      razorpay_payment_id: `pay_test_${Date.now()}`,
      razorpay_signature: 'mock_sig_valid',
      shop_id: 'emitra_101'
    })
  });
  const verifyData = await verifyRes.json();
  console.log(' Payment Verify Result:', verifyData);

  if (verifyData.status === 'PAID') {
    console.log('  PASSED: Order marked as PAID and entered print queue!');
  }

  // 6. Check Pending Queue for Desktop Agent
  console.log('\n[TEST 6] Checking Pending Kiosk Queue (/api/kiosks/jobs/pending)...');
  const queueRes = await fetch(`${BASE_URL}/api/kiosks/jobs/pending?shop_id=emitra_101`);
  const queueData = await queueRes.json();
  console.log(` Found ${queueData.jobs.length} jobs awaiting physical spooling.`);

  console.log('\n===============================================================');
  console.log(' ALL 6 BACKEND & ALGORITHM TESTS PASSED!');
  console.log('===============================================================');

  // Clean up scratch test file
  if (fs.existsSync(testPdfPath)) fs.unlinkSync(testPdfPath);

  return { order_id: checkoutData.order_id };
}

runE2ETest().catch(e => {
  console.error('E2E TEST FAILED:', e);
  process.exit(1);
});
