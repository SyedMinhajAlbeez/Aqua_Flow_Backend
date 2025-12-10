// routes/index.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

router.use("/auth", require("./authRoutes"));
router.use("/companies", protect, require("./companyRoutes"));
router.use("/users", protect, tenantMiddleware, require("./userRoutes"));
router.use(
  "/app/driver/payment",
  protect,
  tenantMiddleware,
  require("./paymentRoutes")
);
router.use(
  "/customer/recurring",
  protect,
  tenantMiddleware,
  require("./customerappRoutes/customerReccuringRoutes")
);
router.use(
  "/customer/orders",
  protect,
  tenantMiddleware,
  require("./customerappRoutes/customerorderRoutes")
);
router.use(
  "/admin/customers",
  protect,
  tenantMiddleware,
  require("./customerAdminRoutes")
);
router.use(
  "/admin/drivers",
  protect,
  tenantMiddleware,
  require("./adminDriverRoutes")
);
router.use(
  "/driver/app",
  protect,
  tenantMiddleware,
  require("./driverappRoutes/driverOrderRoutes")
);

router.use("/products", protect, tenantMiddleware, require("./productRoutes"));
router.use(
  "/delivery-operations",
  protect,
  tenantMiddleware,
  require("./deliveryOperationsRoute")
);
router.use(
  "/inventory",
  protect,
  tenantMiddleware,
  require("./inventoryRoute")
);
router.use("/orders", protect, tenantMiddleware, require("./orderRoutes"));
router.use("/zones", protect, tenantMiddleware, require("./zoneRoutes"));

module.exports = router;
