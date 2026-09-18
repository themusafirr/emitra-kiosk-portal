const express = require('express');
const router = express.Router();
const { readShops, writeShops, readJobs } = require('../db');

// GET /api/shops/:shopId - Get shop details and live printer status
router.get('/:shopId', (req, res) => {
  const { shopId } = req.params;
  const shops = readShops();
  const shop = shops[shopId];

  if (!shop) {
    return res.status(404).json({
      error: `Shop '${shopId}' not found. Please verify the QR code.`
    });
  }

  // Calculate live online status (heartbeat within last 45 seconds)
  const isHeartbeatRecent = shop.last_heartbeat && (Date.now() - shop.last_heartbeat < 45000);
  const isOnline = isHeartbeatRecent && shop.is_online;
  const isHardwareReady = shop.printer?.is_ready && (shop.license?.valid !== false);

  res.json({
    shop_id: shop.shop_id,
    name: shop.name,
    owner_name: shop.owner_name,
    address: shop.address,
    phone: shop.phone,
    rates: shop.rates,
    upi_id: shop.upi_id || 'sharma.emitra@okaxis',
    is_online: isOnline,
    is_hardware_ready: isHardwareReady,
    printer_name: shop.printer?.name || 'Default Printer',
    printer_status: shop.printer?.status_code || 'UNKNOWN',
    printer_message: isOnline ? (shop.printer?.message || 'Printer Ready') : 'Dukan ka PC ya Print Software abhi Offline hai.',
    license: shop.license,
    last_heartbeat: shop.last_heartbeat,
    razorpay_key_id: shop.razorpay?.key_id
  });
});

// PUT /api/shops/:shopId/settings - Shopkeeper Admin Dashboard update
router.put('/:shopId/settings', (req, res) => {
  const { shopId } = req.params;
  const shops = readShops();

  if (!shops[shopId]) {
    return res.status(404).json({ error: "Shop not found" });
  }

  const { rates, razorpay, name, phone, address, upi_id, owner_name } = req.body;

  if (rates) shops[shopId].rates = { ...shops[shopId].rates, ...rates };
  if (razorpay) shops[shopId].razorpay = { ...shops[shopId].razorpay, ...razorpay };
  if (upi_id) shops[shopId].upi_id = upi_id;
  if (name) shops[shopId].name = name;
  if (owner_name) shops[shopId].owner_name = owner_name;
  if (phone) shops[shopId].phone = phone;
  if (address) shops[shopId].address = address;

  writeShops(shops);
  res.json({ success: true, shop: shops[shopId] });
});

// GET /api/shops/:shopId/analytics - Earning & Print analytics for shopkeeper
router.get('/:shopId/analytics', (req, res) => {
  const { shopId } = req.params;
  const jobs = readJobs().filter(j => j.shop_id === shopId && (j.status === 'PRINTED_ACK' || j.status === 'PAID'));

  let totalEarnings = 0;
  let totalPages = 0;
  let bwCount = 0;
  let colorCount = 0;
  let idCardCount = 0;

  jobs.forEach(job => {
    totalEarnings += (job.total_amount || 0);
    if (job.items) {
      job.items.forEach(item => {
        totalPages += (item.pages * (item.copies || 1));
        if (item.type === 'id_card') idCardCount += (item.copies || 1);
        else if (item.color) colorCount += (item.pages * (item.copies || 1));
        else bwCount += (item.pages * (item.copies || 1));
      });
    }
  });

  res.json({
    total_orders: jobs.length,
    total_earnings: totalEarnings,
    total_pages: totalPages,
    breakdown: {
      bw_pages: bwCount,
      color_pages: colorCount,
      id_cards: idCardCount
    },
    recent_jobs: jobs.slice(-10).reverse()
  });
});

// GET /api/shops - Master Admin: List all onboarded shops with analytics
router.get('/', (req, res) => {
  const shops = readShops();
  const jobs = readJobs();
  const now = Date.now();

  const shopList = Object.values(shops).map(shop => {
    const isHeartbeatRecent = shop.last_heartbeat && (now - shop.last_heartbeat < 45000);
    const shopJobs = jobs.filter(j => j.shop_id === shop.shop_id && (j.status === 'PRINTED_ACK' || j.status === 'PAID'));

    let todayEarnings = 0;
    let todayPages = 0;
    const startOfToday = new Date().setHours(0, 0, 0, 0);

    shopJobs.forEach(j => {
      if (j.paid_at && j.paid_at >= startOfToday) {
        todayEarnings += (j.total_amount || 0);
        (j.items || []).forEach(it => todayPages += (it.pages * (it.copies || 1)));
      }
    });

    return {
      shop_id: shop.shop_id,
      name: shop.name,
      owner_name: shop.owner_name || '',
      phone: shop.phone || '',
      address: shop.address || '',
      is_online: isHeartbeatRecent && shop.is_online,
      is_hardware_ready: shop.printer?.is_ready && (shop.license?.valid !== false),
      printer_name: shop.printer?.name || 'Default Printer',
      printer_status: shop.printer?.status_code || 'OFFLINE',
      today_earnings: todayEarnings,
      today_pages: todayPages,
      total_orders: shopJobs.length,
      license_days: shop.license?.days_remaining ?? 365
    };
  });

  res.json({ shops: shopList });
});

// POST /api/shops - Master Admin: Add a new shop
router.post('/', (req, res) => {
  const { shop_id, name, owner_name, phone, address, rates } = req.body;

  if (!shop_id || !name) {
    return res.status(400).json({ error: "shop_id and name are required" });
  }

  const shops = readShops();
  if (shops[shop_id]) {
    return res.status(400).json({ error: "Shop ID already exists!" });
  }

  shops[shop_id] = {
    shop_id,
    name,
    owner_name: owner_name || '',
    phone: phone || '',
    address: address || '',
    rates: rates || { bw_single: 2, bw_duplex: 3, color_single: 10, color_duplex: 18, id_card: 10 },
    razorpay: { key_id: "rzp_test_emitra_sample", key_secret: "mock_secret_123" },
    printer: { name: 'Default Printer', is_ready: false, status_code: 'AWAITING_AGENT' },
    license: { valid: true, status: 'ACTIVE', days_remaining: 365 },
    last_heartbeat: 0,
    is_online: false
  };

  writeShops(shops);
  res.json({ success: true, shop: shops[shop_id] });
});

// GET /api/shops/:shopId/standee - Download Printable A4 QR Counter Standee PDF
router.get('/:shopId/standee', async (req, res) => {
  const { shopId } = req.params;
  const shops = readShops();
  const shop = shops[shopId];

  if (!shop) {
    return res.status(404).json({ error: "Shop not found" });
  }

  try {
    const { generateShopStandeePdf } = require('../services/qrStandeeService');
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const pdfBuffer = await generateShopStandeePdf(shop, baseUrl);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="Print_Standee_${shopId}.pdf"`);
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    console.error('Standee generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
