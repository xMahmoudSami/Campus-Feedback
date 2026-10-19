const { ValidationError } = require('./errorHandler');

/**
 * Validates that a route param (e.g. :id) is a positive integer.
 */
function validateIntegerParam(paramName = 'id') {
  return (req, res, next) => {
    const rawVal = req.params[paramName];
    const num = Number(rawVal);
    if (!rawVal || !Number.isInteger(num) || num <= 0) {
      return next(new ValidationError(`Parameter '${paramName}' must be a valid positive integer.`));
    }
    req.params[paramName] = num;
    next();
  };
}

/**
 * Validates login request body.
 */
function validateLoginBody(req, res, next) {
  const { identifier, username, email, password } = req.body || {};
  const userIdentifier = identifier || username || email;

  if (!userIdentifier || typeof userIdentifier !== 'string' || !userIdentifier.trim()) {
    return next(new ValidationError('Username or email is required.'));
  }

  if (!password || typeof password !== 'string') {
    return next(new ValidationError('Password is required.'));
  }

  req.body.loginIdentifier = userIdentifier.trim();
  next();
}

/**
 * Validates survey creation payload.
 * Schema allows: rating, text, multiple_choice.
 * (Transparently normalizes 'single_choice' to 'multiple_choice' for client flexibility)
 */
function validateSurveyCreate(req, res, next) {
  const { title, description, status, questions } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    return next(new ValidationError("Field 'title' is required and must be a non-empty string."));
  }

  if (title.length > 200) {
    return next(new ValidationError("Field 'title' must not exceed 200 characters."));
  }

  if (status && !['draft', 'published', 'closed'].includes(status)) {
    return next(new ValidationError("Field 'status' must be one of: 'draft', 'published', 'closed'."));
  }

  if (questions !== undefined) {
    if (!Array.isArray(questions)) {
      return next(new ValidationError("Field 'questions' must be an array."));
    }

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question_text || typeof q.question_text !== 'string' || !q.question_text.trim()) {
        return next(new ValidationError(`Question at index ${i} requires a non-empty 'question_text'.`));
      }

      // Normalize single_choice to multiple_choice to match database schema constraint
      if (q.question_type === 'single_choice') {
        q.question_type = 'multiple_choice';
      }

      if (!['text', 'rating', 'multiple_choice'].includes(q.question_type)) {
        return next(
          new ValidationError(
            `Question at index ${i} has invalid 'question_type' ('${q.question_type}'). Supported types in database: 'rating', 'text', 'multiple_choice'.`
          )
        );
      }

      if (q.question_type === 'multiple_choice') {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          return next(
            new ValidationError(
              `Question at index ${i} is multiple_choice and must have an 'options' array with at least 2 choices.`
            )
          );
        }
      }
    }
  }

  next();
}

/**
 * Validates survey status update payload.
 */
function validateSurveyStatus(req, res, next) {
  const { status } = req.body || {};
  if (!status || !['draft', 'published', 'closed'].includes(status)) {
    return next(new ValidationError("Field 'status' is required and must be one of: 'draft', 'published', 'closed'."));
  }
  next();
}

/**
 * Validates survey response submission.
 */
function validateResponseSubmission(req, res, next) {
  const { answers } = req.body || {};

  if (!answers || !Array.isArray(answers) || answers.length === 0) {
    return next(new ValidationError("Field 'answers' is required and must be a non-empty array of question responses."));
  }

  for (let i = 0; i < answers.length; i++) {
    const a = answers[i];
    if (!a.question_id || !Number.isInteger(Number(a.question_id))) {
      return next(new ValidationError(`Answer at index ${i} must contain a valid integer 'question_id'.`));
    }
  }

  next();
}

/**
 * Validates feedback creation payload.
 * Schema columns: student_id, survey_id (optional), message, created_at.
 */
function validateFeedbackCreate(req, res, next) {
  const { message, survey_id } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return next(new ValidationError("Field 'message' is required and must be a non-empty string."));
  }

  if (survey_id !== undefined && survey_id !== null) {
    const num = Number(survey_id);
    if (!Number.isInteger(num) || num <= 0) {
      return next(new ValidationError("Field 'survey_id' must be a valid positive integer if provided."));
    }
    req.body.survey_id = num;
  }

  next();
}

module.exports = {
  validateIntegerParam,
  validateLoginBody,
  validateSurveyCreate,
  validateSurveyStatus,
  validateResponseSubmission,
  validateFeedbackCreate,
};
