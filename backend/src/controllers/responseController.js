const responseService = require('../services/responseService');

/**
 * Submits a completed response for a published survey.
 * Student only.
 */
async function submitResponse(req, res, next) {
  try {
    const surveyId = req.params.id;
    const studentId = req.user.id;
    const { answers } = req.body;

    const result = await responseService.submitResponse(surveyId, studentId, answers);
    res.status(201).json({
      success: true,
      message: result.message,
      data: result.response,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves all student responses submitted for a given survey.
 * Admin only.
 */
async function getSurveyResponses(req, res, next) {
  try {
    const surveyId = req.params.id;
    const result = await responseService.getSurveyResponses(surveyId);
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves all survey responses submitted by the currently logged in student.
 * Student only.
 */
async function getMyResponses(req, res, next) {
  try {
    const studentId = req.user.id;
    const responses = await responseService.getMyResponses(studentId);
    res.status(200).json({
      success: true,
      count: responses.length,
      data: { responses },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  submitResponse,
  getSurveyResponses,
  getMyResponses,
};
