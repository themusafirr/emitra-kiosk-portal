require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const shopRoutes = require('./routes/shops');
const kioskRoutes = require('./routes/kiosks');
const orderRoutes = require('./routes/orders');
const { startAutoRefundWatchdog } = require('./services/paymentService');
const { startZeroRetentionCleanup } = require('./services/cleanupService');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS for PWA and local LAN access
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads serving for desktop agent downloading
const uploadsPath = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// API Routes
app.use('/api/shops', shopRoutes);
app.use('/api/kiosks', kioskRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', orderRoutes);

// Serve compiled PWA frontend (Zero-Cloud Local or VPS Docker)
const candidatePaths = [
  path.join(__dirname, '..', 'public'),
  path.join(__dirname, '..', '..', 'pwa-customer', 'dist'),
  path.join(__dirname, '..', 'dist')
];
const pwaDistPath = candidatePaths.find(p => fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) || candidatePaths[0];
if (fs.existsSync(pwaDistPath)) {
  app.use(express.static(pwaDistPath));
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'HEALTHY',
    service: 'e-Mitra Self-Service Print Kiosk Server',
    timestamp: new Date().toISOString(),
    frontend_loaded: fs.existsSync(path.join(pwaDistPath, 'index.html')),
    frontend_path: pwaDistPath
  });
});

// Fallback to PWA index.html for SPA routing
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  const indexPath = path.join(pwaDistPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  next();
});

// Start background services
startAutoRefundWatchdog(30000);     // Check every 30s for jobs > 15m without spool confirmation
startZeroRetentionCleanup(30, 60000); // Purge files older than 30 minutes every 60s

app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`  e-Mitra Contactless Print Kiosk Backend Server   `);
  console.log(`  Running on: http://localhost:${PORT}             `);
  console.log(`  Network/LAN: http://0.0.0.0:${PORT}              `);
  console.log(`====================================================`);
});
