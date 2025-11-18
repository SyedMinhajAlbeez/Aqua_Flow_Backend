// src/app.js
const express = require("express");
const cors = require("cors");
const path = require("path"); // YE ADD KIYA
require("dotenv").config();

const apiRoutes = require("./routes");
const errorHandler = require("./utils/errorHandler");

const app = express();
const PORT = process.env.PORT || 7000;

// Middlewares
app.use(cors());
app.use(express.json());

// YE LINE ADD KARO — SABSE UPAR (routes se pehle)
app.use("/images", express.static(path.join(__dirname, "../public/images")));

// API Routes
app.use("/api", apiRoutes);

// Error Handler
app.use(errorHandler);

// Start Server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
