// src/controllers/productController.js
// FULLY BINARY (MULTER) READY – NOV 19, 2025

const prisma = require("../prisma/client");
const fs = require("fs");
const path = require("path");

const UPLOAD_DIR = path.join(process.cwd(), "public", "images");

// Helper: Purani image delete karo
const deleteOldImage = (imageUrl) => {
  if (!imageUrl) return;
  const filename = imageUrl.startsWith("/images/")
    ? imageUrl.slice(8)
    : path.basename(imageUrl);
  const fullPath = path.join(UPLOAD_DIR, filename);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
    console.log("Old image deleted:", filename);
  }
};

// CREATE PRODUCT - FULLY UPDATED WITH REUSABLE FIELDS
exports.createProduct = async (req, res) => {
  try {
    const {
      name,
      size,
      price,
      isReusable = false, // ← Default false
      depositAmount = 0, // ← Default 0
      requiresEmptyReturn = false, // ← Default false
    } = req.body;

    const tenantId = req.derivedTenantId;
    const userId = req.user.id;

    // Required validation
    if (!name || !size || !price) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res
        .status(400)
        .json({ error: "Name, size and price are required" });
    }

    const imageUrl = req.file ? `/images/${req.file.filename}` : null;

    // Convert string "true"/"false" to boolean
    const isReusableBool = isReusable === true || isReusable === "true";
    const requiresEmptyReturnBool =
      requiresEmptyReturn === true || requiresEmptyReturn === "true";

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        size: size.trim(),
        price: parseFloat(price),
        image: imageUrl,
        tenantId,
        userId,
        status: "active",
        // ← YE SAB ADD HO GAYE!
        isReusable: isReusableBool,
        depositAmount: isReusableBool ? parseFloat(depositAmount) || 0 : 0,
        requiresEmptyReturn: requiresEmptyReturnBool,
      },
    });

    res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error("Create product error:", err);
    res.status(500).json({ error: "Failed to create product" });
  }
};

// GET PRODUCTS (same)
exports.getProducts = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const tenantId = req.derivedTenantId;

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where: { tenantId },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          size: true,
          price: true,
          image: true,
          status: true,
          createdAt: true,
          isReusable: true,
          depositAmount: true,
          requiresEmptyReturn: true,
          user: { select: { name: true } },
        },
      }),
      prisma.product.count({ where: { tenantId } }),
    ]);

    res.json({
      products,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};
// UPDATE PRODUCT - AB FULLY UPDATED WITH REUSABLE FIELDS
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    const {
      name,
      size,
      price,
      isReusable,
      depositAmount,
      requiresEmptyReturn,
    } = req.body;

    const current = await prisma.product.findUnique({
      where: { id, tenantId },
      select: { image: true, isReusable: true },
    });

    if (!current) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: "Product not found" });
    }

    // Old image delete if new image uploaded
    let imageUrl = current.image;
    if (req.file) {
      if (imageUrl) deleteOldImage(imageUrl);
      imageUrl = `/images/${req.file.filename}`;
    }

    // Boolean conversion
    const isReusableBool =
      isReusable === true || isReusable === "true" || isReusable === undefined
        ? current.isReusable
        : false;

    const data = {
      ...(name && { name: name.trim() }),
      ...(size && { size: trim() }),
      ...(price !== undefined && { price: parseFloat(price) }),
      ...(imageUrl !== undefined && { image: imageUrl }),
      // ← YE TEEN ADD KAR DE
      ...(isReusable !== undefined && { isReusable: isReusableBool }),
      ...(isReusableBool &&
        depositAmount !== undefined && {
          depositAmount: parseFloat(depositAmount) || 0,
        }),
      // Agar isReusable false ho gaya to deposit 0 kar do automatically
      ...(!isReusableBool && { depositAmount: 0 }),
      ...(requiresEmptyReturn !== undefined && {
        requiresEmptyReturn:
          requiresEmptyReturn === true || requiresEmptyReturn === "true",
      }),
    };

    const product = await prisma.product.update({
      where: { id, tenantId },
      data,
    });

    res.json({ message: "Product updated successfully", product });
  } catch (err) {
    if (req.file) fs.unlinkSync(req.file.path);
    console.error("Update product error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
};

// TOGGLE STATUS
exports.toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    const product = await prisma.product.findUnique({
      where: { id, tenantId },
      select: { status: true },
    });

    if (!product) return res.status(404).json({ error: "Product not found" });

    const updated = await prisma.product.update({
      where: { id, tenantId },
      data: { status: product.status === "active" ? "inactive" : "active" },
    });

    res.json({ message: "Status updated", status: updated.status });
  } catch (err) {
    console.error("Toggle status error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
};
