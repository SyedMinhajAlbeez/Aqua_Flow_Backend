// src/routes/productRoutes.js
const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload");
const { protect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

const {
  createProduct,
  getProducts,
  updateProduct,
  toggleProductStatus,
} = require("../controllers/productController");

// PROTECT + TENANT + MULTER (binary upload)
router.post("/create", protect, tenantMiddleware, upload, createProduct);
router.put("/update/:id", protect, tenantMiddleware, upload, updateProduct);
router.get("/all", protect, tenantMiddleware, getProducts);
router.patch("/status/:id", protect, tenantMiddleware, toggleProductStatus);

module.exports = router;
