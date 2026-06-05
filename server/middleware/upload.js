const multer = require("multer");
const path = require("path");
const fs = require("fs");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const filename = `profile_${Date.now()}${ext}`;
    cb(null, filename);
  },
});

const ALLOWED_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// File type filter
const fileFilter = (req, file, cb) => {
  if (!file || !file.originalname || !file.mimetype) {
    return cb(new Error("Invalid file upload"), false);
  }

  const ext = path.extname(file.originalname).toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (!ALLOWED_EXTS.includes(ext) || !ALLOWED_MIMES.includes(mime)) {
    return cb(new Error("Dangerous file type blocked. Only JPEG, PNG, GIF, and WEBP images are allowed."), false);
  }

  cb(null, true);
};

// Multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
});

module.exports = upload;
