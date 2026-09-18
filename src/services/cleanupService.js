const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads');

/**
 * Zero-Retention Privacy Service:
 * Automatically deletes all uploaded customer files and generated PDFs after 30 minutes.
 */
function startZeroRetentionCleanup(maxAgeMinutes = 30, checkIntervalMs = 60000) {
  console.log(`[PRIVACY] Zero-retention auto-purge active (Files older than ${maxAgeMinutes}m will be destroyed).`);

  setInterval(() => {
    try {
      if (!fs.existsSync(UPLOADS_DIR)) return;

      const now = Date.now();
      const files = fs.readdirSync(UPLOADS_DIR);

      for (const file of files) {
        const fullPath = path.join(UPLOADS_DIR, file);
        try {
          const stats = fs.statSync(fullPath);
          const ageMinutes = (now - stats.mtimeMs) / (1000 * 60);

          if (ageMinutes >= maxAgeMinutes) {
            fs.unlinkSync(fullPath);
            console.log(`[ZERO-RETENTION] Auto-purged expired file: ${file} (Age: ${Math.round(ageMinutes)}m)`);
          }
        } catch (e) {
          // File might already be deleted or locked
        }
      }
    } catch (err) {
      console.error('[CLEANUP SERVICE ERROR]:', err.message);
    }
  }, checkIntervalMs);
}

module.exports = {
  startZeroRetentionCleanup
};
