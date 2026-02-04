// routes/index.js
const express = require("express");
const router = express.Router();
const { protect } = require("../middleware/authMiddleware");
const tenantMiddleware = require("../middleware/tenantMiddleware");

router.use("/auth", require("./authRoutes"));
router.use("/companies", protect, require("./companyRoutes"));
router.use("/users", protect, tenantMiddleware, require("./userRoutes"));
router.use(
  "/admin",
  protect,
  tenantMiddleware,
  require("./admindashboardRoutes"),
);
router.use(
  "/app/driver/payment",
  protect,
  tenantMiddleware,
  require("./paymentRoutes"),
);
router.use(
  "/customer/recurring",
  protect,
  tenantMiddleware,
  require("./customerappRoutes/customerReccuringRoutes"),
);

// FCM TOKEN ROUTE

router.use(
  "/fcm",
  protect,
  tenantMiddleware,
  require("./fcmTokenRoutes/fcmRoutes"),
);

router.use(
  "/customer/orders",
  protect,
  tenantMiddleware,
  require("./customerappRoutes/customerorderRoutes"),
);
router.use(
  "/admin/customers",
  protect,
  tenantMiddleware,
  require("./customerAdminRoutes"),
);

router.use(
  "/admin/customer-admin",
  protect,
  tenantMiddleware,
  require("./billingsRoutes"),
);

router.use(
  "/admin/drivers",
  protect,
  tenantMiddleware,
  require("./adminDriverRoutes"),
);
router.use(
  "/driver/app",
  protect,
  tenantMiddleware,
  require("./driverappRoutes/driverOrderRoutes"),
);

router.use("/products", protect, tenantMiddleware, require("./productRoutes"));
router.use(
  "/delivery-operations",
  protect,
  tenantMiddleware,
  require("./deliveryOperationsRoute"),
);
router.use(
  "/inventory",
  protect,
  tenantMiddleware,
  require("./inventoryRoute"),
);
router.use("/orders", protect, tenantMiddleware, require("./orderRoutes"));
router.use("/zones", protect, tenantMiddleware, require("./zoneRoutes"));

router.use(
  "/tariff",
  protect,
  tenantMiddleware,
  require("./tariffManagementRoutes"),
);

router.use(
  "/company-tariff",
  protect,
  tenantMiddleware,
  require("./companyTariffRoute"),
);

router.use("/invoices", protect, tenantMiddleware, require("./invoiceRoutes"));

router.use(
  "/company-payment",
  protect,
  tenantMiddleware,
  require("./createPaymentCompRoute"),
);

router.use("/reports", protect, tenantMiddleware, require("./reportRoutes"));

module.exports = router;
