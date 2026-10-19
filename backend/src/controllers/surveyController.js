const surveyService = require('../services/surveyService');

/**
 * Retrieves list of surveys.
 */
async function getSurveys(req, res, next) {
  try {
    const filters = { status: req.query.status };
    const surveys = await surveyService.getSurveys(req.user, filters);
    res.status(200).json({
      success: true,
      count: surveys.length,
      data: { surveys },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Retrieves details and questions of a single survey.
 */
async function getSurveyById(req, res, next) {
  try {
    const surveyId = req.params.id;
    const requestMeta = {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'],
    };

    const survey = await surveyService.getSurveyById(surveyId, req.user, requestMeta);
    res.status(200).json({
      success: true,
      data: { survey },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Creates a new survey with questions. Admin only.
 */
async function createSurvey(req, res, next) {
  try {
    const survey = await surveyService.createSurvey(req.body, req.user.id);
    res.status(201).json({
      success: true,
      message: 'Survey created successfully.',
      data: { survey },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates survey details. Admin only.
 */
async function updateSurvey(req, res, next) {
  try {
    const surveyId = req.params.id;
    const updated = await surveyService.updateSurvey(surveyId, req.body);
    res.status(200).json({
      success: true,
      message: 'Survey updated successfully.',
      data: { survey: updated },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Updates survey lifecycle status ('draft', 'published', 'closed'). Admin only.
 */
async function updateSurveyStatus(req, res, next) {
  try {
    const surveyId = req.params.id;
    const { status } = req.body;
    const updated = await surveyService.updateSurveyStatus(surveyId, status);
    res.status(200).json({
      success: true,
      message: `Survey status updated to '${status}'.`,
      data: { survey: updated },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * Deletes a survey and its child records. Admin only.
 */
async function deleteSurvey(req, res, next) {
  try {
    const surveyId = req.params.id;
    const result = await surveyService.deleteSurvey(surveyId);
    res.status(200).json({
      success: true,
      message: result.message,
      data: { id: result.id },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getSurveys,
  getSurveyById,
  createSurvey,
  updateSurvey,
  updateSurveyStatus,
  deleteSurvey,
};
