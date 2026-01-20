// src/controllers/orderController.js - FIXED VERSION

const prisma = require("../prisma/client");
const { sendOrderStatusUpdate } = require("../utils/notificationService");

// exports.createOrder = async (req, res) => {
//   try {
//     const {
//       customerId,
//       items,
//       deliveryDate,
//       driverId,
//       paymentMethod = "cash_on_delivery",
//       acceptableDepositAmount = 0,
//       isRecurring = false,
//       recurrence = "NONE",
//       preferredTime = null,
//       withBottles = true, // Yeh parameter constant hai, ise reassign nahi kar sakte
//     } = req.body;

//     const tenantId = req.derivedTenantId;
//     let createdById = req.user.id;
//     const userRole = req.user.role;

//     // === AUTH & CUSTOMER ID LOGIC ===
//     let effectiveCustomerId = customerId;
//     let isCustomerOrder = false;

//     if (userRole === "customer") {
//       isCustomerOrder = true;
//       effectiveCustomerId = req.user.id;
//       if (driverId) {
//         return res.status(400).json({
//           error: "Customers cannot assign drivers during order creation",
//         });
//       }
//       createdById = null;
//     } else if (
//       !["company_admin", "super_admin", "company_user"].includes(userRole)
//     ) {
//       return res.status(403).json({ error: "Unauthorized" });
//     }

//     // === BASIC VALIDATION ===
//     if (!effectiveCustomerId || !items?.length || !deliveryDate) {
//       return res.status(400).json({
//         error: "customerId, items, and deliveryDate are required",
//       });
//     }
//     if (acceptableDepositAmount < 0) {
//       return res.status(400).json({ error: "Deposit cannot be negative" });
//     }

//     // === FETCH CUSTOMER WITH ZONE ===
//     const customer = await prisma.customer.findUnique({
//       where: { id: effectiveCustomerId, tenantId },
//       include: { zone: true },
//     });
//     if (!customer) return res.status(404).json({ error: "Customer not found" });
//     if (!customer.zoneId)
//       return res.status(400).json({ error: "Customer has no zone assigned" });

//     // === PROCESS ITEMS FIRST TO DETERMINE PRODUCT TYPES ===
//     let totalProductPrice = 0;
//     let totalRequiredDeposit = 0;
//     const orderItems = [];
//     let totalReusableDelivered = 0;
//     let circulatingReusableDelivered = 0;
//     let expectedEmpties = 0;
//     let hasReusableProduct = false;
//     let hasNonReusableProduct = false;
//     let nonReusableProductNames = [];

//     // Store products for later use
//     const products = [];

//     for (const item of items) {
//       const product = await prisma.product.findUnique({
//         where: { id: item.productId, tenantId },
//       });
//       if (!product || product.status !== "active") {
//         return res
//           .status(400)
//           .json({ error: `Product not available: ${item.productId}` });
//       }

//       products.push({
//         ...product,
//         quantity: parseInt(item.quantity) || 1,
//       });

//       if (product.isReusable) {
//         hasReusableProduct = true;
//       } else {
//         hasNonReusableProduct = true;
//         nonReusableProductNames.push(product.name);
//       }
//     }

//     // === EFFECTIVE WITHBOTTLES LOGIC ===
//     // Ek naya variable banaye jo hum modify kar sake
//     let effectiveWithBottles = withBottles;

//     // WITHBOTTLES VALIDATION - ONLY FOR REUSABLE PRODUCTS
//     if (hasReusableProduct) {
//       // Agar withBottles false hai to check karo ke customer ke paas pehle se bottles hain
//       if (effectiveWithBottles === false || effectiveWithBottles === "false") {
//         // Check if customer already has bottles for this product
//         const hasPreviousReusableOrders = await prisma.order.findFirst({
//           where: {
//             customerId: effectiveCustomerId,
//             tenantId,
//             items: {
//               some: {
//                 product: {
//                   isReusable: true,
//                 },
//               },
//             },
//             status: { in: ["completed", "delivered"] },
//           },
//         });

//         if (!hasPreviousReusableOrders) {
//           return res.status(400).json({
//             error:
//               "Customer must have received bottles before to order without bottles",
//             solution: "Set withBottles to true for first-time bottle delivery",
//           });
//         }
//       }
//     } else {
//       // Agar sirf non-reusable products hain, to withBottles always true ho (ya irrelevant)
//       effectiveWithBottles = true; // Yeh new variable hai, ise modify kar sakte hain
//     }

//     // === DRIVER VALIDATION (only if provided) ===
//     let initialStatus = "pending";
//     if (driverId) {
//       const driver = await prisma.driver.findUnique({
//         where: { id: driverId, tenantId },
//         include: { zone: true },
//       });
//       if (!driver) return res.status(404).json({ error: "Driver not found" });
//       if (driver.status !== "active")
//         return res.status(400).json({ error: "Driver is not active" });
//       // if (driver.zoneId !== customer.zoneId)
//       //   return res.status(400).json({ error: "Driver must be from same zone" });

//       initialStatus = "in_progress";
//     }

//     // === Check bottle inventory for withBottles true - ONLY FOR REUSABLE PRODUCTS ===
//     if (
//       hasReusableProduct &&
//       (effectiveWithBottles === true || effectiveWithBottles === "true")
//     ) {
//       const bottleInventory = await prisma.bottleInventory.findUnique({
//         where: { tenantId },
//       });

//       for (const productData of products) {
//         const product = productData;
//         const quantity = productData.quantity;

//         if (product.isReusable) {
//           if (bottleInventory && bottleInventory.inStock < quantity) {
//             return res.status(400).json({
//               error: `Not enough bottles in stock for ${product.name}. Available: ${bottleInventory.inStock}, Required: ${quantity}`,
//             });
//           }
//         }
//       }
//     }

//     // === PROCESS ITEMS FOR CALCULATIONS ===
//     for (const productData of products) {
//       const product = productData;
//       const quantity = productData.quantity;

//       // Stock check - withBottles se independent (product stock)
//       const inventory = await prisma.productInventory.findUnique({
//         where: { productId_tenantId: { productId: product.id, tenantId } },
//       });

//       if (!inventory || inventory.currentStock < quantity) {
//         return res.status(400).json({
//           error: `${product.name} out of stock! Available: ${
//             inventory?.currentStock || 0
//           }`,
//         });
//       }

//       const itemTotal = quantity * product.price;
//       totalProductPrice += itemTotal;

//       // === DEPOSIT CALCULATION BASED ON WITHBOTTLES ===
//       if (
//         product.isReusable &&
//         (effectiveWithBottles === true || effectiveWithBottles === "true")
//       ) {
//         // Sirf tab deposit add karo jab bottles de rahe hain
//         totalRequiredDeposit += quantity * product.depositAmount;
//       }

//       orderItems.push({
//         productId: product.id,
//         quantity,
//         unitPrice: product.price,
//         depositAmount:
//           product.isReusable &&
//           (effectiveWithBottles === true || effectiveWithBottles === "true")
//             ? product.depositAmount
//             : 0,
//         totalPrice: itemTotal,
//       });

//       // === BOTTLE TRACKING BASED ON WITHBOTTLES ===
//       if (product.isReusable) {
//         if (effectiveWithBottles === true || effectiveWithBottles === "true") {
//           totalReusableDelivered += quantity;
//           if (product.requiresEmptyReturn) {
//             circulatingReusableDelivered += quantity;
//             expectedEmpties += quantity;
//           }
//         }
//         // Agar withBottles false hai to koi bottle tracking nahi
//       }
//     }

//     // ============ UPDATED VALIDATION: RECURRING ORDER REQUIREMENTS ============
//     if (isRecurring) {
//       // 1. Must have at least one reusable product
//       if (!hasReusableProduct) {
//         return res.status(400).json({
//           error: "Recurring orders must include at least one reusable product",
//         });
//       }

//       // 2. Must NOT have any non-reusable products
//       if (hasNonReusableProduct) {
//         return res.status(400).json({
//           error: "Recurring orders can only contain reusable products.",
//           nonReusableItems: nonReusableProductNames,
//           solution:
//             "Please remove non-reusable items or create as one-time order.",
//         });
//       }

//       // 3. Validate recurrence type
//       const validRecurrences = ["WEEKLY", "BI_WEEKLY", "MONTHLY"];
//       if (!validRecurrences.includes(recurrence)) {
//         return res.status(400).json({
//           error: `Invalid recurrence. Must be one of: ${validRecurrences.join(
//             ", "
//           )}`,
//         });
//       }

//       // 4. Validate recurrence is provided
//       if (recurrence === "NONE") {
//         return res.status(400).json({
//           error:
//             "Recurrence is required for recurring orders (WEEKLY, BI_WEEKLY, MONTHLY)",
//         });
//       }
//     }

//     // Deposit validation - agar withBottles false hai to acceptableDepositAmount 0 hona chahiye
//     if (
//       hasReusableProduct &&
//       (effectiveWithBottles === false || effectiveWithBottles === "false") &&
//       acceptableDepositAmount > 0
//     ) {
//       return res.status(400).json({
//         error: "Cannot accept deposit when withBottles is false",
//       });
//     }

//     if (acceptableDepositAmount > totalRequiredDeposit) {
//       return res.status(400).json({
//         error: `Acceptable deposit cannot exceed required deposit (${totalRequiredDeposit})`,
//       });
//     }

//     const totalAmount = totalProductPrice + acceptableDepositAmount;

//     // === ORDER NUMBER ===
//     const orderCount = await prisma.order.count({ where: { tenantId } });
//     const orderNumberDisplay = `#${1000 + orderCount + 1}`;

//     // === CALCULATE NEXT RECURRING DATE ===
//     let nextRecurringDate = null;
//     if (isRecurring) {
//       const deliveryDateObj = new Date(deliveryDate);
//       nextRecurringDate = new Date(deliveryDateObj);

//       switch (recurrence) {
//         case "WEEKLY":
//           nextRecurringDate.setDate(deliveryDateObj.getDate() + 7);
//           break;
//         case "BI_WEEKLY":
//           nextRecurringDate.setDate(deliveryDateObj.getDate() + 14);
//           break;
//         case "MONTHLY":
//           nextRecurringDate.setMonth(deliveryDateObj.getMonth() + 1);
//           break;
//       }
//     }

//     // === MAIN TRANSACTION ===
//     const result = await prisma.$transaction(
//       async (tx) => {
//         // 1. Create Order
//        const newOrder = await tx.order.create({
//   data: {
//     // ──────── DO NOT set orderNumberDisplay here ────────
//     customerId: effectiveCustomerId,
//     driverId: driverId || null,
//     zoneId: customer.zoneId,
//     deliveryDate: new Date(deliveryDate),
//     deliveryAddress: customer.address,
//     totalAmount,
//     acceptableDepositAmount,
//     paymentMethod,
//     status: initialStatus,
//     tenantId,
//     createdById,
//     isRecurring,
//     recurrence: isRecurring ? recurrence : "NONE",
//     nextRecurringDate,
//     withBottles,
//     items: { create: orderItems },
//   },
// });
// const displayNumber = `#${newOrder.orderNumber}`;
//         // 2. Update Customer Security Deposit - SIRF WITHBOTTLES TRUE HONE PAR AUR REUSABLE PRODUCTS KE LIYE
//         if (acceptableDepositAmount > 0) {
//           await tx.order.update({
//   where: { id: newOrder.id },
//   data: { orderNumberDisplay: displayNumber },
// });
//         }

//         // 3. Decrement Product Stock
//         for (const item of items) {
//           await tx.productInventory.update({
//             where: {
//               productId_tenantId: { productId: item.productId, tenantId },
//             },
//             data: {
//               currentStock: { decrement: parseInt(item.quantity) || 1 },
//               totalSold: { increment: parseInt(item.quantity) || 1 },
//             },
//           });
//         }

//         // 4. Global Bottle Pool Update - SIRF WITHBOTTLES TRUE HONE PAR AUR REUSABLE PRODUCTS KE LIYE
//         if (
//           hasReusableProduct &&
//           totalReusableDelivered > 0 &&
//           (effectiveWithBottles === true || effectiveWithBottles === "true")
//         ) {
//           await tx.bottleInventory.upsert({
//             where: { tenantId },
//             update: {
//               inStock: { decrement: totalReusableDelivered },
//               withCustomers: { increment: totalReusableDelivered },
//             },
//             create: {
//               tenantId,
//               inStock: Math.max(0, -totalReusableDelivered),
//               withCustomers: totalReusableDelivered,
//             },
//           });
//         }

//         // 5. Customer empties tracking - SIRF WITHBOTTLES TRUE HONE PAR AUR REUSABLE PRODUCTS KE LIYE
//         if (
//           hasReusableProduct &&
//           circulatingReusableDelivered > 0 &&
//           (effectiveWithBottles === true || effectiveWithBottles === "true")
//         ) {
//           await tx.customer.update({
//             where: { id: effectiveCustomerId },
//             data: {
//               empties: { increment: expectedEmpties },
//               bottlesGiven: { increment: circulatingReusableDelivered },
//             },
//           });
//         }

//         // 6. CREATE SUBSCRIPTION IF RECURRING (withBottles true hone par hi)
//         let subscription = null;
//         if (
//           isRecurring &&
//           hasReusableProduct &&
//           (effectiveWithBottles === true || effectiveWithBottles === "true")
//         ) {
//           // For each reusable product, create a subscription
//           for (const orderItem of orderItems) {
//             const product = await tx.product.findUnique({
//               where: { id: orderItem.productId },
//             });

//             if (product.isReusable) {
//               subscription = await tx.subscription.create({
//                 data: {
//                   customerId: effectiveCustomerId,
//                   tenantId,
//                   productId: product.id,
//                   quantity: orderItem.quantity,
//                   recurrence,
//                   deliveryDayOfWeek: new Date(deliveryDate).getDay(),
//                   nextDeliveryDate: nextRecurringDate,
//                   preferredTime,
//                   status: "ACTIVE",
//                 },
//               });

//               // Link subscription to order
//               await tx.order.update({
//                 where: { id: newOrder.id },
//                 data: { subscriptionId: subscription.id },
//               });

//               break;
//             }
//           }
//         }

//         // FINAL FETCH WITH ALL DETAILS
//         const finalOrder = await tx.order.findUnique({
//           where: { id: newOrder.id },
//           include: {
//             customer: {
//               select: {
//                 id: true,
//                 name: true,
//                 phone: true,
//                 address: true,
//               },
//             },
//             ...(driverId && {
//               driver: {
//                 select: {
//                   id: true,
//                   name: true,
//                   phone: true,
//                   vehicleNumber: true,
//                   vehicleType: true,
//                 },
//               },
//             }),
//             zone: { select: { id: true, name: true } },
//             items: {
//               include: {
//                 product: {
//                   select: {
//                     id: true,
//                     name: true,
//                     size: true,
//                     price: true,
//                     depositAmount: true,
//                     isReusable: true,
//                     requiresEmptyReturn: true,
//                   },
//                 },
//               },
//             },
//             subscription: isRecurring
//               ? {
//                   select: {
//                     id: true,
//                     recurrence: true,
//                     nextDeliveryDate: true,
//                     status: true,
//                   },
//                 }
//               : false,
//           },
//         });

//         return {
//           order: finalOrder,
//           subscription: subscription,
//         };
//       },
//       { timeout: 20000 }
//     );

//     // Send notification if driver assigned immediately
//     if (driverId && result.order.customer) {
//       await sendOrderStatusUpdate(
//         result.order.customer.id,
//         result.order.orderNumberDisplay,
//         "in_progress",
//         result.order.driver?.name
//       );
//     }

//     res.status(201).json({
//       success: true,
//       message: isRecurring
//         ? `Recurring order created successfully! ${
//             hasReusableProduct
//               ? effectiveWithBottles === true || effectiveWithBottles === "true"
//                 ? "With bottles"
//                 : "Refill only"
//               : ""
//           }.`
//         : `Order created successfully! ${
//             hasReusableProduct
//               ? effectiveWithBottles === true || effectiveWithBottles === "true"
//                 ? "With bottles"
//                 : "Refill only"
//               : ""
//           }.`,
//       order: {
//         ...result.order,
//         isRecurring,
//         recurrence: isRecurring ? recurrence : "NONE",
//         nextRecurringDate: result.order.nextRecurringDate,
//         withBottles: hasReusableProduct
//           ? effectiveWithBottles === true || effectiveWithBottles === "true"
//           : true,
//       },
//       subscription: result.subscription,
//       details: {
//         withBottles: hasReusableProduct
//           ? effectiveWithBottles === true || effectiveWithBottles === "true"
//           : true,
//         hasReusableProduct,
//         hasNonReusableProduct,
//         totalRequiredDeposit,
//         acceptableDepositAmount,
//         reusableBottlesDelivered: totalReusableDelivered,
//         expectedEmpties,
//         initialStatus,
//         isCustomerOrder,
//         nextDelivery: isRecurring ? nextRecurringDate : null,
//       },
//     });
//   } catch (err) {
//     console.error("Create Order Error:", err);
//     res.status(500).json({
//       success: false,
//       error: "Failed to create order",
//       details: err.message,
//     });
//   }
// };






// // ==================== GET ALL ORDERS ====================
// exports.getOrders = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 10;
//     const skip = (page - 1) * limit;
//     const tenantId = req.derivedTenantId;

//     // Optional filters
//     const status = req.query.status;
//     const isRecurring = req.query.isRecurring;
//     const date = req.query.date;

//     let where = { tenantId };

//     // Apply filters
//     if (status) where.status = status;
//     if (isRecurring === "true") where.isRecurring = true;
//     if (isRecurring === "false") where.isRecurring = false;
//     if (date) {
//       const startDate = new Date(date);
//       startDate.setHours(0, 0, 0, 0);
//       const endDate = new Date(date);
//       endDate.setDate(endDate.getDate() + 1);
//       where.deliveryDate = {
//         gte: startDate,
//         lt: endDate,
//       };
//     }

//     const [orders, total, stats] = await Promise.all([
//       prisma.order.findMany({
//         where,
//         skip,
//         take: limit,
//         orderBy: { createdAt: "desc" },
//         include: {
//           customer: {
//             select: {
//               id: true,
//               name: true,
//               phone: true,
//             },
//           },
//           driver: {
//             select: {
//               id: true,
//               name: true,
//               vehicleNumber: true,
//               vehicleType: true,
//             },
//           },
//           zone: { select: { id: true, name: true } },
//           items: {
//             include: {
//               product: {
//                 select: {
//                   id: true,
//                   name: true,
//                   size: true,
//                   isReusable: true,
//                 },
//               },
//             },
//           },
//           subscription: {
//             select: {
//               id: true,
//               recurrence: true,
//               status: true,
//             },
//           },
//         },
//       }),
//       prisma.order.count({ where }),
//       prisma.order.groupBy({
//         by: ["status"],
//         where: { tenantId },
//         _count: { status: true },
//       }),
//     ]);

//     // Get recurring stats
//     const recurringStats = await prisma.order.groupBy({
//       by: ["isRecurring"],
//       where: { tenantId },
//       _count: { isRecurring: true },
//     });

//     const statusCount = stats.reduce((acc, curr) => {
//       acc[curr.status] = curr._count.status;
//       return acc;
//     }, {});

//     const recurringCount = recurringStats.reduce(
//       (acc, curr) => {
//         acc[curr.isRecurring ? "recurring" : "oneTime"] =
//           curr._count.isRecurring;
//         return acc;
//       },
//       { recurring: 0, oneTime: 0 }
//     );

//     res.json({
//       success: true,
//       orders,
//       stats: {
//         totalOrders: total,
//         pending: statusCount.pending || 0,
//         in_progress: statusCount.in_progress || 0,
//         delivered: statusCount.delivered || 0,
//         completed: statusCount.completed || 0,
//         cancelled: statusCount.cancelled || 0,
//         failed: statusCount.failed || 0,
//         ...recurringCount,
//       },
//       pagination: {
//         page,
//         limit,
//         total,
//         totalPages: Math.ceil(total / limit),
//       },
//       filters: {
//         status,
//         isRecurring,
//         date,
//       },
//     });
//   } catch (err) {
//     console.error("Get Orders Error:", err);
//     res.status(500).json({
//       success: false,
//       error: "Failed to fetch orders",
//     });
//   }
// };

// ==================== GET ALL ORDERS ====================

exports.createOrder = async (req, res) => {
  try {
    const {
      customerId,
      items,
      deliveryDate,
      driverId,
      paymentMethod = "cash_on_delivery",
      acceptableDepositAmount = 0,
      isRecurring = false,
      recurrence = "NONE",
      preferredTime = null,
      withBottles = true,
    } = req.body;

    const tenantId = req.derivedTenantId;
    let createdById = req.user.id;
    const userRole = req.user.role;

    // === AUTH & CUSTOMER ID LOGIC ===
    let effectiveCustomerId = customerId;
    let isCustomerOrder = false;

    if (userRole === "customer") {
      isCustomerOrder = true;
      effectiveCustomerId = req.user.id;
      if (driverId) {
        return res.status(400).json({
          error: "Customers cannot assign drivers during order creation",
        });
      }
      createdById = null;
    } else if (
      !["company_admin", "super_admin", "company_user"].includes(userRole)
    ) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    // === BASIC VALIDATION ===
    if (!effectiveCustomerId || !items?.length || !deliveryDate) {
      return res.status(400).json({
        error: "customerId, items, and deliveryDate are required",
      });
    }
    if (acceptableDepositAmount < 0) {
      return res.status(400).json({ error: "Deposit cannot be negative" });
    }

    // === FETCH CUSTOMER WITH ZONE ===
    const customer = await prisma.customer.findUnique({
      where: { id: effectiveCustomerId, tenantId },
      include: { zone: true },
    });
    if (!customer) return res.status(404).json({ error: "Customer not found" });
    if (!customer.zoneId)
      return res.status(400).json({ error: "Customer has no zone assigned" });

    // === PROCESS ITEMS FIRST TO DETERMINE PRODUCT TYPES ===
    let totalProductPrice = 0;
    let totalRequiredDeposit = 0;
    const orderItems = [];
    let totalReusableDelivered = 0;
    let circulatingReusableDelivered = 0;
    let expectedEmpties = 0;
    let hasReusableProduct = false;
    let hasNonReusableProduct = false;
    let nonReusableProductNames = [];

    // Store products for later use
    const products = [];

    for (const item of items) {
      const product = await prisma.product.findUnique({
        where: { id: item.productId, tenantId },
      });
      if (!product || product.status !== "active") {
        return res
          .status(400)
          .json({ error: `Product not available: ${item.productId}` });
      }

      products.push({
        ...product,
        quantity: parseInt(item.quantity) || 1,
      });

      if (product.isReusable) {
        hasReusableProduct = true;
      } else {
        hasNonReusableProduct = true;
        nonReusableProductNames.push(product.name);
      }
    }

    // === EFFECTIVE WITHBOTTLES LOGIC ===
    let effectiveWithBottles = withBottles;

    if (hasReusableProduct) {
      if (effectiveWithBottles === false || effectiveWithBottles === "false") {
        const hasPreviousReusableOrders = await prisma.order.findFirst({
          where: {
            customerId: effectiveCustomerId,
            tenantId,
            items: {
              some: {
                product: {
                  isReusable: true,
                },
              },
            },
            status: { in: ["completed", "delivered"] },
          },
        });

        if (!hasPreviousReusableOrders) {
          return res.status(400).json({
            error:
              "Customer must have received bottles before to order without bottles",
            solution: "Set withBottles to true for first-time bottle delivery",
          });
        }
      }
    } else {
      effectiveWithBottles = true;
    }

    // === DRIVER VALIDATION (only if provided) ===
    let initialStatus = "pending";
    if (driverId) {
      const driver = await prisma.driver.findUnique({
        where: { id: driverId, tenantId },
        include: { zone: true },
      });
      if (!driver) return res.status(404).json({ error: "Driver not found" });
      if (driver.status !== "active")
        return res.status(400).json({ error: "Driver is not active" });

      initialStatus = "in_progress";
    }

    // === Check bottle inventory for withBottles true - ONLY FOR REUSABLE PRODUCTS ===
    if (
      hasReusableProduct &&
      (effectiveWithBottles === true || effectiveWithBottles === "true")
    ) {
      const bottleInventory = await prisma.bottleInventory.findUnique({
        where: { tenantId },
      });

      for (const productData of products) {
        const product = productData;
        const quantity = productData.quantity;

        if (product.isReusable) {
          if (bottleInventory && bottleInventory.inStock < quantity) {
            return res.status(400).json({
              error: `Not enough bottles in stock for ${product.name}. Available: ${bottleInventory.inStock}, Required: ${quantity}`,
            });
          }
        }
      }
    }

    // === PROCESS ITEMS FOR CALCULATIONS ===
    for (const productData of products) {
      const product = productData;
      const quantity = productData.quantity;

      // Stock check
      const inventory = await prisma.productInventory.findUnique({
        where: { productId_tenantId: { productId: product.id, tenantId } },
      });

      if (!inventory || inventory.currentStock < quantity) {
        return res.status(400).json({
          error: `${product.name} out of stock! Available: ${
            inventory?.currentStock || 0
          }`,
        });
      }

      const itemTotal = quantity * product.price;
      totalProductPrice += itemTotal;

      if (
        product.isReusable &&
        (effectiveWithBottles === true || effectiveWithBottles === "true")
      ) {
        totalRequiredDeposit += quantity * product.depositAmount;
      }

      orderItems.push({
        productId: product.id,
        quantity,
        unitPrice: product.price,
        depositAmount:
          product.isReusable &&
          (effectiveWithBottles === true || effectiveWithBottles === "true")
            ? product.depositAmount
            : 0,
        totalPrice: itemTotal,
      });

      if (product.isReusable) {
        if (effectiveWithBottles === true || effectiveWithBottles === "true") {
          totalReusableDelivered += quantity;
          if (product.requiresEmptyReturn) {
            circulatingReusableDelivered += quantity;
            expectedEmpties += quantity;
          }
        }
      }
    }

    // ============ RECURRING ORDER VALIDATION ============
    if (isRecurring) {
      if (!hasReusableProduct) {
        return res.status(400).json({
          error: "Recurring orders must include at least one reusable product",
        });
      }

      if (hasNonReusableProduct) {
        return res.status(400).json({
          error: "Recurring orders can only contain reusable products.",
          nonReusableItems: nonReusableProductNames,
          solution:
            "Please remove non-reusable items or create as one-time order.",
        });
      }

      const validRecurrences = ["WEEKLY", "BI_WEEKLY", "MONTHLY"];
      if (!validRecurrences.includes(recurrence)) {
        return res.status(400).json({
          error: `Invalid recurrence. Must be one of: ${validRecurrences.join(
            ", "
          )}`,
        });
      }

      if (recurrence === "NONE") {
        return res.status(400).json({
          error:
            "Recurrence is required for recurring orders (WEEKLY, BI_WEEKLY, MONTHLY)",
        });
      }
    }

    // Deposit validation
    if (
      hasReusableProduct &&
      (effectiveWithBottles === false || effectiveWithBottles === "false") &&
      acceptableDepositAmount > 0
    ) {
      return res.status(400).json({
        error: "Cannot accept deposit when withBottles is false",
      });
    }

    if (acceptableDepositAmount > totalRequiredDeposit) {
      return res.status(400).json({
        error: `Acceptable deposit cannot exceed required deposit (${totalRequiredDeposit})`,
      });
    }

    const totalAmount = totalProductPrice + acceptableDepositAmount;

    // === CALCULATE NEXT RECURRING DATE ===
    let nextRecurringDate = null;
    if (isRecurring) {
      const deliveryDateObj = new Date(deliveryDate);
      nextRecurringDate = new Date(deliveryDateObj);

      switch (recurrence) {
        case "WEEKLY":
          nextRecurringDate.setDate(deliveryDateObj.getDate() + 7);
          break;
        case "BI_WEEKLY":
          nextRecurringDate.setDate(deliveryDateObj.getDate() + 14);
          break;
        case "MONTHLY":
          nextRecurringDate.setMonth(deliveryDateObj.getMonth() + 1);
          break;
      }
    }

    // === MAIN TRANSACTION ===
    const result = await prisma.$transaction(
      async (tx) => {
        // 1. Create Order (without orderNumberDisplay)
        const newOrder = await tx.order.create({
          data: {
            customerId: effectiveCustomerId,
            driverId: driverId || null,
            zoneId: customer.zoneId,
            deliveryDate: new Date(deliveryDate),
            deliveryAddress: customer.address,
            totalAmount,
            acceptableDepositAmount,
            paymentMethod,
            status: initialStatus,
            tenantId,
            createdById,
            isRecurring,
            recurrence: isRecurring ? recurrence : "NONE",
            nextRecurringDate,
            withBottles: effectiveWithBottles, // ← use the correct effective value
            items: { create: orderItems },
          },
        });

        // 2. Generate and set orderNumberDisplay (always, not conditional)
        const displayNumber = `#${1000 + newOrder.orderNumber}`; // you can remove +1000 or use year prefix

        await tx.order.update({
          where: { id: newOrder.id },
          data: { orderNumberDisplay: displayNumber },
        });

        // 3. Update Customer Security Deposit (if any)
        if (acceptableDepositAmount > 0) {
          await tx.customer.update({
            where: { id: effectiveCustomerId },
            data: { securityDeposit: { increment: acceptableDepositAmount } },
          });
        }

        // 4. Decrement Product Stock
        for (const item of items) {
          await tx.productInventory.update({
            where: {
              productId_tenantId: { productId: item.productId, tenantId },
            },
            data: {
              currentStock: { decrement: parseInt(item.quantity) || 1 },
              totalSold: { increment: parseInt(item.quantity) || 1 },
            },
          });
        }

        // 5. Global Bottle Pool Update
        if (
          hasReusableProduct &&
          totalReusableDelivered > 0 &&
          effectiveWithBottles
        ) {
          await tx.bottleInventory.upsert({
            where: { tenantId },
            update: {
              inStock: { decrement: totalReusableDelivered },
              withCustomers: { increment: totalReusableDelivered },
            },
            create: {
              tenantId,
              inStock: Math.max(0, -totalReusableDelivered),
              withCustomers: totalReusableDelivered,
            },
          });
        }

        // 6. Customer empties tracking
        if (
          hasReusableProduct &&
          circulatingReusableDelivered > 0 &&
          effectiveWithBottles
        ) {
          await tx.customer.update({
            where: { id: effectiveCustomerId },
            data: {
              empties: { increment: expectedEmpties },
              bottlesGiven: { increment: circulatingReusableDelivered },
            },
          });
        }

        // 7. CREATE SUBSCRIPTION IF RECURRING
        let subscription = null;
        if (
          isRecurring &&
          hasReusableProduct &&
          effectiveWithBottles
        ) {
          for (const orderItem of orderItems) {
            const product = await tx.product.findUnique({
              where: { id: orderItem.productId },
            });

            if (product.isReusable) {
              subscription = await tx.subscription.create({
                data: {
                  customerId: effectiveCustomerId,
                  tenantId,
                  productId: product.id,
                  quantity: orderItem.quantity,
                  recurrence,
                  deliveryDayOfWeek: new Date(deliveryDate).getDay(),
                  nextDeliveryDate: nextRecurringDate,
                  preferredTime,
                  status: "ACTIVE",
                },
              });

              await tx.order.update({
                where: { id: newOrder.id },
                data: { subscriptionId: subscription.id },
              });

              break;
            }
          }
        }

        // 8. FINAL FETCH WITH ALL DETAILS
        const finalOrder = await tx.order.findUnique({
          where: { id: newOrder.id },
          include: {
            customer: {
              select: {
                id: true,
                name: true,
                phone: true,
                address: true,
              },
            },
            ...(driverId && {
              driver: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  vehicleNumber: true,
                  vehicleType: true,
                },
              },
            }),
            zone: { select: { id: true, name: true } },
            items: {
              include: {
                product: {
                  select: {
                    id: true,
                    name: true,
                    size: true,
                    price: true,
                    depositAmount: true,
                    isReusable: true,
                    requiresEmptyReturn: true,
                  },
                },
              },
            },
            subscription: isRecurring
              ? {
                  select: {
                    id: true,
                    recurrence: true,
                    nextDeliveryDate: true,
                    status: true,
                  },
                }
              : false,
          },
        });

        return {
          order: finalOrder,
          subscription: subscription,
        };
      },
      { timeout: 20000 }
    );

    // Send notification if driver assigned immediately
    if (driverId && result.order.customer) {
      await sendOrderStatusUpdate(
        result.order.customer.id,
        result.order.orderNumberDisplay,
        "in_progress",
        result.order.driver?.name
      );
    }

    res.status(201).json({
      success: true,
      message: isRecurring
        ? `Recurring order created successfully! ${
            hasReusableProduct
              ? effectiveWithBottles
                ? "With bottles"
                : "Refill only"
              : ""
          }.`
        : `Order created successfully! ${
            hasReusableProduct
              ? effectiveWithBottles
                ? "With bottles"
                : "Refill only"
              : ""
          }.`,
      order: {
        ...result.order,
        isRecurring,
        recurrence: isRecurring ? recurrence : "NONE",
        nextRecurringDate: result.order.nextRecurringDate,
        withBottles: effectiveWithBottles,
      },
      subscription: result.subscription,
      details: {
        withBottles: effectiveWithBottles,
        hasReusableProduct,
        hasNonReusableProduct,
        totalRequiredDeposit,
        acceptableDepositAmount,
        reusableBottlesDelivered: totalReusableDelivered,
        expectedEmpties,
        initialStatus,
        isCustomerOrder,
        nextDelivery: isRecurring ? nextRecurringDate : null,
      },
    });
  } catch (err) {
    console.error("Create Order Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to create order",
      details: err.message,
    });
  }
};

exports.getOrders = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const tenantId = req.derivedTenantId;

    // ─── All possible filters ─────────────────────────────────────────────
    const {
      status,
      isRecurring,
      date,                     // backward compatibility with old single date
      deliveryDate,             // exact date
      deliveryDateFrom,
      deliveryDateTo,
      zoneId,
      customerId,
      driverId,
      search,                   // search by order number / customer name/phone
      quickFilter,              // today, tomorrow, thisWeek, pending, etc.
      sortBy = "createdAt",     // default to createdAt for consistency with original
      sortOrder = "desc",       // default descending (newest first)
      paymentStatus,            // ADDED: payment status filter
    } = req.query;

    // Build dynamic where clause
    const where = { tenantId };

    // Status filter
    if (status) where.status = status;

    // Payment Status filter - ADDED
    if (paymentStatus) where.paymentStatus = paymentStatus;

    // Recurring filter (keep same logic as before)
    if (isRecurring === "true") where.isRecurring = true;
    if (isRecurring === "false") where.isRecurring = false;

    // Date filters - support multiple formats for compatibility
    let deliveryDateFilter = null;

    if (date) {
      // Old behavior - single date
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);
      deliveryDateFilter = { gte: startDate, lte: endDate };
    } else if (deliveryDate) {
      // Exact date
      const startDate = new Date(deliveryDate);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(deliveryDate);
      endDate.setHours(23, 59, 59, 999);
      deliveryDateFilter = { gte: startDate, lte: endDate };
    } else if (deliveryDateFrom || deliveryDateTo) {
      deliveryDateFilter = {};
      if (deliveryDateFrom) {
        const from = new Date(deliveryDateFrom);
        from.setHours(0, 0, 0, 0);
        deliveryDateFilter.gte = from;
      }
      if (deliveryDateTo) {
        const to = new Date(deliveryDateTo);
        to.setHours(23, 59, 59, 999);
        deliveryDateFilter.lte = to;
      }
    }

    if (deliveryDateFilter) {
      where.deliveryDate = deliveryDateFilter;
    }

    // Additional direct filters
    if (zoneId) where.zoneId = zoneId;
    if (customerId) where.customerId = customerId;
    if (driverId) where.driverId = driverId;

    // Quick filters (overrides other date filters when used)
    if (quickFilter) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      switch (quickFilter.toLowerCase()) {
        case "today":
          const tomorrow = new Date(today);
          tomorrow.setDate(tomorrow.getDate() + 1);
          where.deliveryDate = { gte: today, lt: tomorrow };
          break;

        case "tomorrow":
          const tomorrowStart = new Date(today);
          tomorrowStart.setDate(tomorrowStart.getDate() + 1);
          const dayAfter = new Date(tomorrowStart);
          dayAfter.setDate(dayAfter.getDate() + 1);
          where.deliveryDate = { gte: tomorrowStart, lt: dayAfter };
          break;

        case "thisweek":
        case "this_week":
          const endOfWeek = new Date(today);
          endOfWeek.setDate(endOfWeek.getDate() + (6 - endOfWeek.getDay()));
          where.deliveryDate = { gte: today, lte: endOfWeek };
          break;

        case "pending":
          where.status = "pending";
          break;

        case "inprogress":
        case "in_progress":
          where.status = "in_progress";
          break;

        // Add more quick filters as needed
        default:
          break;
      }
    }

    // Text search (order number, customer name or phone)
    if (search) {
      where.OR = [
        {
          orderNumberDisplay: {
            contains: search,
            mode: "insensitive",
          },
        },
        {
          customer: {
            name: {
              contains: search,
              mode: "insensitive",
            },
          },
        },
        {
          customer: {
            phone: {
              contains: search,
            },
          },
        },
      ];
    }

    // Sorting
    const validSortFields = [
      "createdAt",
      "deliveryDate",
      "totalAmount",
      "status",
      // You can add more when you have these fields
    ];

    let orderBy = [{ createdAt: "desc" }]; // default

    if (validSortFields.includes(sortBy)) {
      orderBy = [{ [sortBy]: sortOrder === "asc" ? "asc" : "desc" }];
    } else if (sortBy === "zone") {
      orderBy = [{ zone: { name: sortOrder === "asc" ? "asc" : "desc" } }];
    } else if (sortBy === "customer") {
      orderBy = [{ customer: { name: sortOrder === "asc" ? "asc" : "desc" } }];
    }

    // ─── Main query ───────────────────────────────────────────────────────
    const [orders, total, stats] = await Promise.all([
      prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          customer: {
            select: {
              id: true,
              name: true,
              phone: true,
            },
          },
          driver: {
            select: {
              id: true,
              name: true,
              vehicleNumber: true,
              vehicleType: true,
            },
          },
          zone: { select: { id: true, name: true } },
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  size: true,
                  isReusable: true,
                },
              },
            },
          },
          subscription: {
            select: {
              id: true,
              recurrence: true,
              status: true,
            },
          },
        },
      }),
      prisma.order.count({ where }),
      prisma.order.groupBy({
        by: ["status"],
        where: { tenantId },
        _count: { status: true },
      }),
    ]);

    // Recurring stats (same as original)
    const recurringStats = await prisma.order.groupBy({
      by: ["isRecurring"],
      where: { tenantId },
      _count: { isRecurring: true },
    });

    // Payment status stats - ADDED
    const paymentStats = await prisma.order.groupBy({
      by: ["paymentStatus"],
      where: { tenantId },
      _count: { paymentStatus: true },
    });

    const statusCount = stats.reduce((acc, curr) => {
      acc[curr.status] = curr._count.status;
      return acc;
    }, {});

    const recurringCount = recurringStats.reduce(
      (acc, curr) => {
        acc[curr.isRecurring ? "recurring" : "oneTime"] = curr._count.isRecurring;
        return acc;
      },
      { recurring: 0, oneTime: 0 }
    );

    // Build payment stats object - ADDED
    const paymentStatusCount = paymentStats.reduce((acc, curr) => {
      if (curr.paymentStatus) {
        acc[curr.paymentStatus.toLowerCase()] = curr._count.paymentStatus;
      }
      return acc;
    }, {});

    res.json({
      success: true,
      orders,
      stats: {
        totalOrders: total,
        pending: statusCount.pending || 0,
        in_progress: statusCount.in_progress || 0,
        delivered: statusCount.delivered || 0,
        completed: statusCount.completed || 0,
        cancelled: statusCount.cancelled || 0,
        failed: statusCount.failed || 0,
        ...recurringCount,
        // Add payment stats - optional
        ...paymentStatusCount,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      filters: {
        status,
        isRecurring,
        date,
        deliveryDate,
        deliveryDateFrom,
        deliveryDateTo,
        zoneId,
        customerId,
        driverId,
        search,
        quickFilter,
        sortBy,
        sortOrder,
        paymentStatus, // ADDED to filters response
      },
    });
  } catch (err) {
    console.error("Get Orders Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch orders",
      details: err.message,
    });
  }
};

// ==================== UPDATE ORDER STATUS ====================
exports.updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const tenantId = req.derivedTenantId;

    const validStatuses = [
      "pending",
      "confirmed",
      "in_progress",
      "out_for_delivery",
      "delivered",
      "completed",
      "cancelled",
      "failed",
    ];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    const order = await prisma.order.update({
      where: { id, tenantId },
      data: { status },
      include: {
        customer: { select: { id: true, name: true } },
        driver: { select: { id: true, name: true, vehicleNumber: true } },
      },
    });

    // Send notification for status update
    if (["delivered", "completed", "cancelled", "failed"].includes(status)) {
      await sendOrderStatusUpdate(
        order.customer.id,
        order.orderNumberDisplay,
        status,
        order.driver?.name
      );
    }

    res.json({
      success: true,
      message: "Status updated successfully",
      order,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to update status",
    });
  }
};

// ==================== GET ORDER BY ID ====================
exports.getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;

    const order = await prisma.order.findUnique({
      where: { id, tenantId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phone: true,
            address: true,
            email: true,
            zone: { select: { id: true, name: true } },
            empties: true,
            securityDeposit: true,
          },
        },
        driver: {
          select: {
            id: true,
            name: true,
            phone: true,
            vehicleNumber: true,
            vehicleType: true,
            zone: { select: { id: true, name: true } },
          },
        },
        zone: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                size: true,
                price: true,
                depositAmount: true,
                isReusable: true,
                requiresEmptyReturn: true,
                image: true,
              },
            },
          },
        },
        subscription: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                size: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    res.json({
      success: true,
      order,
    });
  } catch (err) {
    console.error("Get Order By ID Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to fetch order",
    });
  }
};

// ==================== CANCEL ORDER ====================
exports.cancelOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const tenantId = req.derivedTenantId;
    const { reason } = req.body;

    const order = await prisma.order.findUnique({
      where: { id, tenantId },
      include: {
        items: {
          include: {
            product: true,
          },
        },
        subscription: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        error: "Order not found",
      });
    }

    if (!["pending", "confirmed", "in_progress"].includes(order.status)) {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel order with status: ${order.status}`,
      });
    }

    await prisma.$transaction(async (tx) => {
      // 1. Update order status
      await tx.order.update({
        where: { id },
        data: {
          status: "cancelled",
          ...(reason && { note: reason }),
        },
      });

      // 2. Return stock to inventory
      for (const item of order.items) {
        await tx.productInventory.update({
          where: {
            productId_tenantId: {
              productId: item.productId,
              tenantId,
            },
          },
          data: {
            currentStock: { increment: item.quantity },
          },
        });
      }

      // 3. Return bottles to inventory if reusable
      const reusableItems = order.items.filter(
        (item) => item.product.isReusable
      );
      if (reusableItems.length > 0) {
        const totalReusable = reusableItems.reduce(
          (sum, item) => sum + item.quantity,
          0
        );

        await tx.bottleInventory.upsert({
          where: { tenantId },
          update: {
            inStock: { increment: totalReusable },
            withCustomers: { decrement: totalReusable },
          },
          create: {
            tenantId,
            inStock: totalReusable,
            withCustomers: -totalReusable,
          },
        });
      }

      // 4. Cancel subscription if exists
      if (order.subscriptionId) {
        await tx.subscription.update({
          where: { id: order.subscriptionId },
          data: { status: "CANCELLED" },
        });
      }

      // 5. Update customer empties
      const customer = await tx.customer.findUnique({
        where: { id: order.customerId },
      });

      if (customer && reusableItems.length > 0) {
        const totalEmpties = reusableItems.reduce((sum, item) => {
          if (item.product.requiresEmptyReturn) {
            return sum + item.quantity;
          }
          return sum;
        }, 0);

        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            empties: { decrement: totalEmpties },
            bottlesGiven: {
              decrement: reusableItems.reduce(
                (sum, item) => sum + item.quantity,
                0
              ),
            },
          },
        });
      }
    });

    // Send notification
    await sendOrderStatusUpdate(
      order.customerId,
      order.orderNumberDisplay,
      "cancelled"
    );

    res.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (err) {
    console.error("Cancel Order Error:", err);
    res.status(500).json({
      success: false,
      error: "Failed to cancel order",
    });
  }
};

// ====================  ORDERS STATS ====================
exports.getOrderStats = async (req, res) => {
  try {
    const tenantId = req.derivedTenantId;

    // Calculate date for last 7 days
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    // ========== PARALLEL QUERIES (FAST) ==========
    const [statusStats, recurringStats, totalOrders, lastWeekOrders] =
      await Promise.all([
        // Group by status
        prisma.order.groupBy({
          by: ["status"],
          where: { tenantId },
          _count: { status: true },
        }),

        // Group by recurring
        prisma.order.groupBy({
          by: ["isRecurring"],
          where: { tenantId },
          _count: { isRecurring: true },
        }),

        // Total orders
        prisma.order.count({
          where: { tenantId },
        }),

        // Orders created in the last week
        prisma.order.count({
          where: {
            tenantId,
            createdAt: {
              gte: oneWeekAgo,
            },
          },
        }),
      ]);

    // Convert results to clean objects
    const statusCount = statusStats.reduce((acc, s) => {
      acc[s.status] = s._count.status;
      return acc;
    }, {});

    const recurringCount = recurringStats.reduce(
      (acc, r) => {
        acc[r.isRecurring ? "recurring" : "oneTime"] = r._count.isRecurring;
        return acc;
      },
      { recurring: 0, oneTime: 0 }
    );

    // Percentage of new orders
    const newOrderPercentage =
      totalOrders > 0
        ? Number(((lastWeekOrders / totalOrders) * 100).toFixed(2))
        : 0;

    // Final response
    return res.status(200).json({
      success: true,
      stats: {
        // Basic stats
        totalOrders,
        lastWeekOrders,
        newOrderPercentage,

        // Status
        pending: statusCount.pending || 0,
        in_progress: statusCount.in_progress || 0,
        delivered: statusCount.delivered || 0,
        completed: statusCount.completed || 0,
        cancelled: statusCount.cancelled || 0,
        failed: statusCount.failed || 0,

        // Recurring stats
        ...recurringCount,
      },
    });
  } catch (error) {
    console.error("Order Stats Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get order statistics",
      details: error.message,
    });
  }
};

