// utils/saveImage.js
const fs = require("fs");
const path = require("path");

const saveBase64Image = (base64String) => {
  if (!base64String || !base64String.startsWith("data:image")) {
    return null;
  }

  const matches = base64String.match(/^data:image\/([a-zA-Z]+);base64,(.+)$/);
  if (!matches) throw new Error("Invalid base64 image");

  const ext = matches[1];
  const base64Data = matches[2];
  const filename = `${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}.${ext}`;

  const filepath = path.join(
    __dirname,
    "..",
    "..",
    "public",
    "images",
    filename
  );
  const dir = path.dirname(filepath);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(filepath, base64Data, "base64");

  return `/images/${filename}`;
};

const deleteImage = (imageUrl) => {
  if (!imageUrl) return;

  const fullPath = path.join(__dirname, "..", "..", "public", imageUrl);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
};

module.exports = { saveBase64Image, deleteImage };
