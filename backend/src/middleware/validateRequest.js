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
 */
function validateSurveyCreate(req, res, next) {
  const { title, description, status, questions } = req.body || {};

  if (!title || typeof title !== 'string' || !title.trim()) {
    return next(new ValidationError("Field 'title' is required and must be a non-empty string."));
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

      if (!['text', 'single_choice', 'rating'].includes(q.question_type)) {
        return next(
          new ValidationError(
            `Question at index ${i} has invalid 'question_type' ('${q.question_type}'). Must be 'text', 'single_choice', or 'rating'.`
          )
        );
      }

      if (q.question_type === 'single_choice') {
        if (!Array.isArray(q.options) || q.options.length < 2) {
          return next(
            new ValidationError(
              `Question at index ${i} is single_choice and must have an 'options' array with at least 2 choices.`
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
 */
function validateFeedbackCreate(req, res, next) {
  const { message, title, category } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    return next(new ValidationError("Field 'message' is required and must be a non-empty string."));
  }

  if (category && typeof category !== 'string') {
    return next(new ValidationError("Field 'category' must be a string if provided."));
  }

  if (title && typeof title !== 'string') {
    return next(new ValidationError("Field 'title' must be a string if provided."));
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
