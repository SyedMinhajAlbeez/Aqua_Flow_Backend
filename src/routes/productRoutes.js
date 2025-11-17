// src/routes/productRoutes.js
const express = require("express");
const {
  createProduct,
  getProducts,
  updateProduct,
  toggleProductStatus,
} = require("../controllers/productController");

const router = express.Router();

router.post("/create", createProduct);
router.get("/all", getProducts); // ?page=1
router.put("/update/:id", updateProduct);
router.patch("/status/:id", toggleProductStatus); // toggle active/inactive

module.exports = router;
