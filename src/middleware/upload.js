// // src/middleware/upload.js
// // FINAL VERSION – WORKS WITH IMAGE COMPRESSION (NOV 19, 2025)

// const multer = require("multer");
// const path = require("path");
// const fs = require("fs");

// const UPLOAD_DIR = path.join(process.cwd(), "public", "images");

// // Create folder if not exists
// if (!fs.existsSync(UPLOAD_DIR)) {
//   fs.mkdirSync(UPLOAD_DIR, { recursive: true });
// }

// const storage = multer.diskStorage({
//   destination: (req, file, cb) => {
//     cb(null, UPLOAD_DIR);
//   },
//   filename: (req, file, cb) => {
//     // Secure & unique filename (even if originalname missing)
//     const uniqueSuffix = `${Date.now()}_${Math.random()
//       .toString(36)
//       .substr(2, 9)}`;
//     const ext = path.extname(file.originalname) || ".jpg"; // fallback .jpg
//     cb(null, uniqueSuffix + ext);
//   },
// });

// const upload = multer({
//   storage,
//   limits: {
//     fileSize: 5 * 1024 * 1024, // 5 MB
//   },
//   fileFilter: (req, file, cb) => {
//     // Allowed MIME types (compression ke baad bhi reliable)
//     const allowedMimes = [
//       "image/jpeg",
//       "image/jpg",
//       "image/png",
//       "image/webp",
//       "image/gif",
//     ];

//     if (allowedMimes.includes(file.mimetype)) {
//       return cb(null, true);
//     }

//     // Clear error message
//     cb(new Error("Invalid file type! Only JPG, PNG, WebP, GIF allowed."));
//   },
// }).single("logo"); // key must be "image" from frontend

// module.exports = upload;










const multer = require("multer");
const path = require("path");
const fs = require("fs");

const UPLOAD_DIR = path.join(process.cwd(), "public", "images");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const ext = path.extname(file.originalname) || ".jpg";
    cb(null, uniqueSuffix + ext);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (allowedMimes.includes(file.mimetype)) {
      return cb(null, true);
    }

    cb(new Error("Invalid file type! Only JPG, PNG, WebP, GIF allowed."));
  },
}).fields([
  { name: "logo", maxCount: 1 },
  { name: "image", maxCount: 1 },
]);

module.exports = upload;
