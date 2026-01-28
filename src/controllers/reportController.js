const prisma = require("../prisma/client");
const reportService = require("../services/reportService");

// Authentication middleware check
const checkSuperAdmin = (req, res, next) => {
  if (req.user.role !== "super_admin") {
    return res.status(403).json({
      success: false,
      message: "Access denied. Super admin only."
    });
  }
  next();
};

/**
 * GET /api/reports/dashboard
 * Super admin dashboard overview
 */
exports.getDashboard = async (req, res) => {
  try {
    checkSuperAdmin(req, res, async () => {
      const dashboard = await reportService.getDashboardOverview();
      
      res.json({
        success: true,
        message: "Dashboard data retrieved successfully",
        data: dashboard
      });
    });
  } catch (error) {
    console.error("Error getting dashboard:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load dashboard",
      error: error.message
    });
  }
};

/**
 * GET /api/reports/company/:companyId
 * Detailed report for a specific company
 */
exports.getCompanyReport = async (req, res) => {
  try {
    checkSuperAdmin(req, res, async () => {
      const { companyId } = req.params;
      const { periodStart, periodEnd } = req.query;
      
      const now = new Date();
      const startDate = periodStart 
        ? new Date(periodStart) 
        : new Date(now.getFullYear(), now.getMonth(), 1);
      
      const endDate = periodEnd 
        ? new Date(periodEnd) 
        : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      
      const report = await reportService.getCompanyDetailReport(
        companyId, 
        startDate, 
        endDate
      );
      
      res.json({
        success: true,
        message: "Company report retrieved successfully",
        data: report
      });
    });
  } catch (error) {
    console.error("Error getting company report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load company report",
      error: error.message
    });
  }
};

/**
 * GET /api/reports/revenue
 * Revenue report with filters
 */
exports.getRevenueReport = async (req, res) => {
  try {
    checkSuperAdmin(req, res, async () => {
      const {
        periodStart,
        periodEnd,
        companyId,
        productType,
        sortBy = "sales",
        sortOrder = "desc",
        limit = 50,
        offset = 0
      } = req.query;
      
      const filters = {
        periodStart,
        periodEnd,
        companyId,
        productType,
        sortBy,
        sortOrder,
        limit: parseInt(limit),
        offset: parseInt(offset)
      };
      
      const report = await reportService.getRevenueReport(filters);
      
      res.json({
        success: true,
        message: "Revenue report retrieved successfully",
        data: report
      });
    });
  } catch (error) {
    console.error("Error getting revenue report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load revenue report",
      error: error.message
    });
  }
};

/**
 * GET /api/reports/export
 * Export report data (CSV/Excel)
 */
exports.exportReport = async (req, res) => {
  try {
    checkSuperAdmin(req, res, async () => {
      const { format = "csv", reportType = "dashboard" } = req.query;
      
      let data;
      switch (reportType) {
        case "dashboard":
          data = await reportService.getDashboardOverview();
          break;
        case "revenue":
          data = await reportService.getRevenueReport(req.query);
          break;
        default:
          throw new Error("Invalid report type");
      }
      
      // For now, return JSON. You can implement CSV/Excel export later
      res.json({
        success: true,
        message: `Report exported in ${format} format`,
        data,
        format,
        exportedAt: new Date()
      });
    });
  } catch (error) {
    console.error("Error exporting report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to export report",
      error: error.message
    });
  }
};

/**
 * GET /api/reports/companies/overdue
 * Get list of companies with overdue invoices
 */
exports.getOverdueCompanies = async (req, res) => {
  try {
    checkSuperAdmin(req, res, async () => {
      const dashboard = await reportService.getDashboardOverview();
      const overdueCompanies = dashboard.highlights.overdueCompanies;
      
      res.json({
        success: true,
        message: "Overdue companies retrieved",
        data: {
          count: overdueCompanies.length,
          companies: overdueCompanies,
          totalOverdue: overdueCompanies.reduce((sum, c) => 
            sum + c.invoices.totalDue, 0
          )
        }
      });
    });
  } catch (error) {
    console.error("Error getting overdue companies:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load overdue companies",
      error: error.message
    });
  }
};

/**
 * GET /api/reports/companies/without-tariff
 * Get companies without active tariff
 */
exports.getCompaniesWithoutTariff = async (req, res) => {
  try {
    checkSuperAdmin(req, res, async () => {
      const dashboard = await reportService.getDashboardOverview();
      const companiesWithoutTariff = dashboard.highlights.companiesWithoutTariff;
      
      res.json({
        success: true,
        message: "Companies without tariff retrieved",
        data: {
          count: companiesWithoutTariff.length,
          companies: companiesWithoutTariff.map(c => ({
            id: c.id,
            name: c.name,
            email: c.email,
            joinedDate: c.joinedDate,
            currentMonthSales: c.currentMonth.sales
          }))
        }
      });
    });
  } catch (error) {
    console.error("Error getting companies without tariff:", error);
    res.status(500).json({
      success: false,
      message: "Failed to load companies without tariff",
      error: error.message
    });
  }
};