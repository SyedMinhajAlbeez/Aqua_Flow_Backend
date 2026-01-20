const express = require("express");
const router = express.Router();
const {
  getAllBillings,
} = require("../controllers/billingsController");

router.get("/billings", getAllBillings);
module.exports = router;
