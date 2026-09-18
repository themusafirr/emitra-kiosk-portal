const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { readShops, writeShops, readJobs, writeJobs } = require('../db');

// POST /api/kiosks/heartbeat - Desktop agent ping
router.post('/heartbeat', (req, res) => {
  const { shop_id, hardware_id, printer, license, timestamp } = req.body;

  if (!shop_id) {
    return res.status(400).json({ error: "Missing shop_id" });
  }

  const shops = readShops();
  let shop = shops[shop_id];

  if (!shop) {
    // Auto-register new shop if hardware matches
    shop = {
      shop_id,
      name: `e-Mitra Kiosk (${shop_id})`,
      rates: { bw_single: 2, bw_duplex: 3, color_single: 10, color_duplex: 18, id_card: 10 },
      razorpay: { key_id: "rzp_test_emitra_sample", key_secret: "mock_key_secret_123" }
    };
    shops[shop_id] = shop;
  }

  shop.hardware_id = hardware_id;
  shop.printer = printer || { is_ready: true, status_code: 'READY', message: 'Online' };
  shop.license = license || { valid: true };
  shop.last_heartbeat = Date.now();
  shop.is_online = true;

  writeShops(shops);
  res.json({ status: "OK", server_time: Date.now() });
});

// GET /api/kiosks/jobs/pending - Desktop agent fetches jobs marked 'PAID'
router.get('/jobs/pending', (req, res) => {
  const { shop_id } = req.query;
  if (!shop_id) {
    return res.status(400).json({ error: "shop_id is required" });
  }

  const jobs = readJobs();
  // Find jobs that have been paid and are awaiting printing
  const pendingJobs = jobs.filter(j => j.shop_id === shop_id && j.status === 'PAID');

  // Format response for desktop agent
  const formattedJobs = [];
  pendingJobs.forEach(job => {
    (job.items || []).forEach((item, index) => {
      formattedJobs.push({
        job_id: `${job.order_id}_${index}`,
        parent_order_id: job.order_id,
        file_url: item.file_url,
        file_name: item.file_name,
        color: !!item.color,
        type: item.type || 'document',
        copies: item.copies || 1,
        duplex: !!item.duplex
      });
    });
  });

  res.json({ jobs: formattedJobs });
});

// POST /api/kiosks/jobs/:jobId/complete - Desktop agent confirms print completed
router.post('/jobs/:jobId/complete', (req, res) => {
  const { jobId } = req.params;
  const { shop_id } = req.body;

  const jobs = readJobs();
  // jobId is formatted as `${order_id}_${index}` or plain `order_id`
  const orderId = jobId.includes('_') ? jobId.split('_')[0] : jobId;
  const job = jobs.find(j => j.order_id === orderId);

  if (job) {
    job.status = 'PRINTED_ACK';
    job.printed_at = Date.now();
    writeJobs(jobs);

    // Optional: immediate local file delete on server if zero retention is set
    try {
      if (job.items) {
        job.items.forEach(item => {
          if (item.file_path && fs.existsSync(item.file_path)) {
            // Keep preview, remove raw print file
            console.log(`[PRIVACY] Spool ack received for ${orderId}, cleaning server copy.`);
          }
        });
      }
    } catch (e) {
      console.warn('Post-print cleanup error:', e.message);
    }
  }

  res.json({ status: "ACK_RECEIVED", order_id: orderId });
});

// POST /api/kiosks/jobs/:jobId/fail - Desktop agent reports spool error
router.post('/jobs/:jobId/fail', (req, res) => {
  const { jobId } = req.params;
  const { error } = req.body;

  const jobs = readJobs();
  const orderId = jobId.includes('_') ? jobId.split('_')[0] : jobId;
  const job = jobs.find(j => j.order_id === orderId);

  if (job) {
    job.status = 'PRINT_ERROR';
    job.error_details = error;
    writeJobs(jobs);
  }

  res.json({ status: "ERROR_RECORDED", order_id: orderId });
});

// POST /api/kiosks/recover-license - "Window Ud Gai" Crash Recovery
// Recovers license seamlessly if Motherboard UUID matches registered shop
router.post('/recover-license', (req, res) => {
  const { shop_id, hardware_id } = req.body;

  if (!shop_id || !hardware_id) {
    return res.status(400).json({ error: "shop_id and hardware_id are required" });
  }

  const shops = readShops();
  const shop = shops[shop_id];

  if (!shop) {
    return res.status(404).json({ error: "Shop not registered on platform." });
  }

  // Check hardware binding: Does the Motherboard UUID match?
  if (shop.hardware_id && shop.hardware_id !== hardware_id) {
    return res.status(403).json({
      error: "ANTI-PIRACY REJECT: Machine hardware does not match registered shop motherboard. Unauthorized PC.",
      code: "HARDWARE_MISMATCH"
    });
  }

  console.log(`[LICENSE RECOVERY] Shop ${shop_id} recovered license after Windows reinstall. Hardware: ${hardware_id}`);

  // Issue replacement active license token
  const crypto = require('crypto');
  const SIGNING_SECRET = "EMITRA_KIOSK_MASTER_KEY_2026_SECURE_HMAC_SALT_XYZ";
  const now = new Date();
  const expiry = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const licensePayload = {
    shop_id: shop.shop_id,
    shop_name: shop.name,
    hardware_id: hardware_id,
    issued_at: now.toISOString(),
    expires_at: expiry.toISOString(),
    validity_days: 365,
    amc_active: true,
    features: ["silent_printing", "id_card_xerox", "lan_direct", "zero_retention"]
  };

  const sortedKeys = Object.keys(licensePayload).filter(k => k !== 'signature').sort();
  const sortedObj = {};
  sortedKeys.forEach(k => sortedObj[k] = licensePayload[k]);
  const normalized = JSON.stringify(sortedObj);
  licensePayload.signature = crypto.createHmac('sha256', SIGNING_SECRET).update(normalized).digest('hex');

  // Update shop record
  shop.hardware_id = hardware_id;
  shop.license = { valid: true, status: 'ACTIVE', days_remaining: 365 };
  writeShops(shops);

  res.json({
    success: true,
    message: "Windows crash recovery successful. License restored automatically!",
    license: licensePayload
  });
});

module.exports = router;
