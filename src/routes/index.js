// routes/index.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

router.use("/auth", require("./authRoutes"));
router.use("/companies", protect, require("./companyRoutes"));
router.use("/users", protect, tenantMiddleware, require("./userRoutes"));
router.use("/customers", require("./customerRoute"));
router.use("/drivers", require("./driverRoutes"));
router.use("/products", protect, tenantMiddleware, require("./productRoutes"));
router.use(
  "/inventory",
  protect,
  tenantMiddleware,
  require("./inventoryRoute")
);
router.use("/orders", protect, tenantMiddleware, require("./orderRoutes"));
router.use("/zones", protect, tenantMiddleware, require("./zoneRoutes"));

module.exports = router;
