const feedbackService = require('../services/feedbackService');

/**
 * Creates a new feedback entry.
 * Student only.
 */
async function createFeedback(req, res, next) {
  try {
    const studentId = req.user.id;
    const feedback = await feedbackService.createFeedback(studentId, req.body);
    res.status(201).json({
      success: true,
      message: 'Feedback submitted successfully.',
      data: { feedback },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves all submitted feedback entries.
 * Admin only.
 */
async function getAllFeedback(req, res, next) {
  try {
    const feedbackList = await feedbackService.getAllFeedback();
    res.status(200).json({
      success: true,
      count: feedbackList.length,
      data: { feedback: feedbackList },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createFeedback,
  getAllFeedback,
};
