const dashboardService = require('../services/dashboardService');

/**
 * Retrieves calculated statistics for the administrator dashboard.
 * Admin only.
 */
async function getAdminDashboard(req, res, next) {
  try {
    const dashboardData = await dashboardService.getAdminDashboard();
    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves personalized survey statistics for the student dashboard.
 * Student only.
 */
async function getStudentDashboard(req, res, next) {
  try {
    const studentId = req.user.id;
    const dashboardData = await dashboardService.getStudentDashboard(studentId);
    res.status(200).json({
      success: true,
      data: dashboardData,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAdminDashboard,
  getStudentDashboard,
};
