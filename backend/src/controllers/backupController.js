const fs = require('fs');
const path = require('path');
const { NotFoundError } = require('../utils/errors');

const BACKUP_DIR = '/var/www/digitaltp/backups';
const FILENAME_RE = /^digitaltp_[\w-]+\.sql\.gz$/;

const listBackups = async (req, res, next) => {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      return res.json({ success: true, data: [] });
    }

    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => FILENAME_RE.test(f))
      .map(filename => {
        const stat = fs.statSync(path.join(BACKUP_DIR, filename));
        return {
          filename,
          size_bytes: stat.size,
          created_at: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    res.json({ success: true, data: files });
  } catch (error) {
    next(error);
  }
};

const downloadBackup = async (req, res, next) => {
  try {
    const { filename } = req.params;

    if (!FILENAME_RE.test(filename)) {
      throw new NotFoundError('Backup not found');
    }

    const filePath = path.join(BACKUP_DIR, filename);

    if (!fs.existsSync(filePath)) {
      throw new NotFoundError('Backup not found');
    }

    res.download(filePath, filename, (err) => {
      if (err && !res.headersSent) next(err);
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { listBackups, downloadBackup };
