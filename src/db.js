const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const SHOPS_FILE = path.join(DATA_DIR, 'shops.json');
const JOBS_FILE = path.join(DATA_DIR, 'jobs.json');

const DEFAULT_SHOPS = {
  "emitra_101": {
    "shop_id": "emitra_101",
    "name": "Sharma e-Mitra & Digital Seva Kendra",
    "owner_name": "Ramesh Sharma",
    "phone": "+91 98765 43210",
    "address": "Shop No. 4, Main Market, Opp. Tehsil, Jaipur",
    "rates": {
      "bw_single": 2.00,
      "bw_duplex": 3.00,
      "color_single": 10.00,
      "color_duplex": 18.00,
      "id_card": 10.00
    },
    "razorpay": {
      "key_id": "rzp_test_emitra_sample",
      "key_secret": "test_secret_key_123",
      "is_sandbox": true
    },
    "hardware_id": "BAE6339FA5B668D4E1912C02A048530D",
    "printer": {
      "name": "Microsoft Print to PDF",
      "is_ready": true,
      "status_code": "READY",
      "message": "Printer is online and ready."
    },
    "license": {
      "valid": true,
      "status": "ACTIVE",
      "days_remaining": 364
    },
    "last_heartbeat": Date.now(),
    "is_online": true
  }
};

function readShops() {
  if (!fs.existsSync(SHOPS_FILE)) {
    fs.writeFileSync(SHOPS_FILE, JSON.stringify(DEFAULT_SHOPS, null, 2));
    return DEFAULT_SHOPS;
  }
  try {
    return JSON.parse(fs.readFileSync(SHOPS_FILE, 'utf-8'));
  } catch {
    return DEFAULT_SHOPS;
  }
}

function writeShops(shops) {
  fs.writeFileSync(SHOPS_FILE, JSON.stringify(shops, null, 2));
}

function readJobs() {
  if (!fs.existsSync(JOBS_FILE)) {
    fs.writeFileSync(JOBS_FILE, JSON.stringify([], null, 2));
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(JOBS_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function writeJobs(jobs) {
  fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
}

module.exports = {
  readShops,
  writeShops,
  readJobs,
  writeJobs
};
