// src/controllers/productController.js
// FULLY UPDATED – WITH SIZE FIELD + PROFESSIONAL WATER DELIVERY READY

const prisma = require("../prisma/client");
const { saveBase64Image, deleteImage } = require("../utils/saveImage");

// CREATE PRODUCT – AB SIZE BHI ZAROORI HAI
exports.createProduct = async (req, res) => {
  try {
    const { name, size, price, image: base64Image } = req.body;
    const tenantId = req.derivedTenantId;
    const userId = req.user.id;

    if (!name || !size || !price) {
      return res.status(400).json({
        error: "name, size, and price are required",
      });
    }

    let imageUrl = null;
    if (base64Image) {
      try {
        imageUrl = saveBase64Image(base64Image);
      } catch (err) {
        return res.status(400).json({ error: "Invalid image format" });
      }
    }

    const product = await prisma.product.create({
      data: {
        name: name.trim(),
        size: size.trim(), // ← NEW FIELD
        price: parseFloat(price),
        image: imageUrl,
        tenantId,
        userId,
        status: "active",
      },
    });

    res.status(201).json({
      message: "Product created successfully",
      product,
    });
  } catch (err) {
    console.error("Create product error:", err);
    res.status(500).json({ error: "Failed to create product" });
  }
};

// GET PRODUCTS – SIZE BHI DIKHEGA
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
          size: true, // ← AB SIZE BHI AAYEGA
          price: true,
          image: true,
          status: true,
          createdAt: true,
          user: { select: { name: true } },
        },
      }),
      prisma.product.count({ where: { tenantId } }),
    ]);

    res.json({
      products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ error: "Failed to fetch products" });
  }
};

// UPDATE PRODUCT – SIZE BHI UPDATE HOGA
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;
    const { name, size, price, image: base64Image } = req.body;

    // Validation
    if (name !== undefined && !name.trim())
      return res.status(400).json({ error: "name cannot be empty" });
    if (size !== undefined && !size.trim())
      return res.status(400).json({ error: "size cannot be empty" });
    if (price !== undefined && isNaN(price))
      return res.status(400).json({ error: "price must be a number" });

    const currentProduct = await prisma.product.findUnique({
      where: { id, tenantId },
      select: { image: true },
    });

    if (!currentProduct) {
      return res.status(404).json({ error: "Product not found" });
    }

    let imageUrl = currentProduct.image;

    if (base64Image !== undefined) {
      if (imageUrl) deleteImage(imageUrl);
      imageUrl = base64Image ? saveBase64Image(base64Image) : null;
    }

    const data = {
      ...(name && { name: name.trim() }),
      ...(size && { size: size.trim() }), // ← SIZE UPDATE
      ...(price !== undefined && { price: parseFloat(price) }),
      ...(imageUrl !== undefined && { image: imageUrl }),
    };

    const product = await prisma.product.update({
      where: { id, tenantId },
      data,
    });

    res.json({
      message: "Product updated successfully",
      product,
    });
  } catch (err) {
    console.error("Update product error:", err);
    res.status(500).json({ error: "Failed to update product" });
  }
};

// TOGGLE STATUS (same)
exports.toggleProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    const product = await prisma.product.findUnique({
      where: { id, tenantId },
      select: { status: true },
    });

    if (!product) return res.status(404).json({ message: "Product not found" });

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
