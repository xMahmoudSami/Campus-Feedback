const db = require('../config/db');
const {
  NotFoundError,
  ValidationError,
  ConflictError,
} = require('../middleware/errorHandler');

/**
 * Submits a survey response and answer set inside a database transaction.
 * Student only.
 *
 * @param {number} surveyId
 * @param {number} studentId
 * @param {Array<{ question_id: number, answer_text?: string, rating_value?: number }>} answers
 */
async function submitResponse(surveyId, studentId, answers) {
  // 1. Fetch survey details and verify status
  const surveyRes = await db.query(
    `SELECT id, title, status FROM surveys WHERE id = $1`,
    [surveyId]
  );

  const survey = surveyRes.rows[0];
  if (!survey) {
    throw new NotFoundError(`Survey with ID ${surveyId} not found.`);
  }

  if (survey.status !== 'published') {
    throw new ValidationError(
      `Cannot submit response. Survey is currently '${survey.status}'. Submissions are only accepted for 'published' surveys.`
    );
  }

  // 2. Check for duplicate submission
  const existingSubmissionRes = await db.query(
    `SELECT id FROM survey_responses WHERE survey_id = $1 AND student_id = $2`,
    [surveyId, studentId]
  );

  if (existingSubmissionRes.rows.length > 0) {
    throw new ConflictError('You have already submitted a response for this survey.');
  }

  // 3. Fetch questions for validation
  const questionsRes = await db.query(
    `SELECT id, question_text, question_type, options, is_required
     FROM questions
     WHERE survey_id = $1`,
    [surveyId]
  );

  const surveyQuestions = questionsRes.rows;
  if (surveyQuestions.length === 0) {
    throw new ValidationError('This survey has no questions configured and cannot accept responses.');
  }

  // Map questions by ID for fast lookup
  const questionMap = new Map();
  for (const q of surveyQuestions) {
    // Parse options if stored as string/json
    let optionsArray = [];
    if (Array.isArray(q.options)) {
      optionsArray = q.options;
    } else if (typeof q.options === 'string') {
      try {
        optionsArray = JSON.parse(q.options);
      } catch (e) {
        optionsArray = [];
      }
    }
    questionMap.set(q.id, { ...q, options: optionsArray });
  }

  // Map answers by question_id to check for duplicate answers in payload and completeness
  const answerMap = new Map();
  for (const item of answers) {
    const qId = Number(item.question_id);
    if (!questionMap.has(qId)) {
      throw new ValidationError(
        `Question ID ${qId} does not belong to survey '${survey.title}' (ID: ${surveyId}).`
      );
    }
    if (answerMap.has(qId)) {
      throw new ValidationError(`Duplicate answer provided for question ID ${qId}.`);
    }
    answerMap.set(qId, item);
  }

  // 4. Validate each survey question against submitted answers
  const sanitizedAnswers = [];

  for (const [qId, question] of questionMap.entries()) {
    const submitted = answerMap.get(qId);

    if (question.is_required && !submitted) {
      throw new ValidationError(`Answer is required for question: "${question.question_text}" (ID: ${qId}).`);
    }

    if (!submitted) {
      continue;
    }

    let finalAnswerText = null;
    let finalRatingValue = null;

    if (question.question_type === 'text') {
      const textVal = submitted.answer_text !== undefined ? String(submitted.answer_text).trim() : '';
      if (question.is_required && !textVal) {
        throw new ValidationError(`Question "${question.question_text}" requires a non-empty text response.`);
      }
      finalAnswerText = textVal || null;
    } else if (question.question_type === 'single_choice') {
      const choiceVal = submitted.answer_text !== undefined ? String(submitted.answer_text).trim() : '';
      if (!choiceVal) {
        if (question.is_required) {
          throw new ValidationError(`Question "${question.question_text}" requires an option to be selected.`);
        }
      } else {
        if (!question.options.includes(choiceVal)) {
          throw new ValidationError(
            `Invalid option '${choiceVal}' for question "${question.question_text}". Allowed choices: ${question.options.join(', ')}`
          );
        }
        finalAnswerText = choiceVal;
      }
    } else if (question.question_type === 'rating') {
      const rawRating = submitted.rating_value !== undefined ? submitted.rating_value : submitted.answer_text;
      const ratingNum = Number(rawRating);

      if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        throw new ValidationError(
          `Question "${question.question_text}" requires an integer rating value between 1 and 5.`
        );
      }
      finalRatingValue = ratingNum;
      finalAnswerText = String(ratingNum);
    }

    sanitizedAnswers.push({
      question_id: qId,
      answer_text: finalAnswerText,
      rating_value: finalRatingValue,
    });
  }

  // 5. Execute transactional insert of response header and answers
  return await db.withTransaction(async (client) => {
    // Double check duplicate in transaction for race conditions
    const raceCheck = await client.query(
      `SELECT id FROM survey_responses WHERE survey_id = $1 AND student_id = $2 FOR UPDATE`,
      [surveyId, studentId]
    );
    if (raceCheck.rows.length > 0) {
      throw new ConflictError('You have already submitted a response for this survey.');
    }

    // Insert response header
    const responseInsertRes = await client.query(
      `INSERT INTO survey_responses (survey_id, student_id)
       VALUES ($1, $2)
       RETURNING id, survey_id, student_id, submitted_at`,
      [surveyId, studentId]
    );

    const responseRecord = responseInsertRes.rows[0];

    // Insert answer rows
    const insertedAnswers = [];
    for (const ans of sanitizedAnswers) {
      const ansRes = await client.query(
        `INSERT INTO answers (response_id, question_id, answer_text, rating_value)
         VALUES ($1, $2, $3, $4)
         RETURNING id, question_id, answer_text, rating_value`,
        [responseRecord.id, ans.question_id, ans.answer_text, ans.rating_value]
      );
      insertedAnswers.push(ansRes.rows[0]);
    }

    return {
      message: 'Survey response submitted successfully.',
      response: {
        ...responseRecord,
        survey_title: survey.title,
        answers: insertedAnswers,
      },
    };
  });
}

/**
 * Retrieves all submitted responses for a given survey.
 * Admin only.
 *
 * @param {number} surveyId
 */
async function getSurveyResponses(surveyId) {
  const surveyRes = await db.query(`SELECT id, title, status FROM surveys WHERE id = $1`, [surveyId]);
  if (surveyRes.rows.length === 0) {
    throw new NotFoundError(`Survey with ID ${surveyId} not found.`);
  }

  const responsesRes = await db.query(
    `SELECT 
       sr.id AS response_id,
       sr.submitted_at,
       u.id AS student_id,
       u.username AS student_username,
       u.email AS student_email,
       u.full_name AS student_full_name,
       COALESCE(
         json_agg(
           json_build_object(
             'question_id', q.id,
             'question_text', q.question_text,
             'question_type', q.question_type,
             'answer_text', a.answer_text,
             'rating_value', a.rating_value
           ) ORDER BY q.order_index ASC, q.id ASC
         ) FILTER (WHERE q.id IS NOT NULL),
         '[]'::json
       ) AS answers
     FROM survey_responses sr
     JOIN users u ON sr.student_id = u.id
     LEFT JOIN answers a ON a.response_id = sr.id
     LEFT JOIN questions q ON a.question_id = q.id
     WHERE sr.survey_id = $1
     GROUP BY sr.id, u.id
     ORDER BY sr.submitted_at DESC;`,
    [surveyId]
  );

  return {
    survey: surveyRes.rows[0],
    total_responses: responsesRes.rows.length,
    responses: responsesRes.rows,
  };
}

/**
 * Retrieves all survey responses submitted by the logged-in student.
 * Student only.
 *
 * @param {number} studentId
 */
async function getMyResponses(studentId) {
  const queryText = `
    SELECT 
      sr.id AS response_id,
      sr.survey_id,
      s.title AS survey_title,
      s.description AS survey_description,
      s.status AS survey_status,
      sr.submitted_at,
      COALESCE(
        json_agg(
          json_build_object(
            'question_id', q.id,
            'question_text', q.question_text,
            'question_type', q.question_type,
            'answer_text', a.answer_text,
            'rating_value', a.rating_value
          ) ORDER BY q.order_index ASC, q.id ASC
        ) FILTER (WHERE q.id IS NOT NULL),
        '[]'::json
      ) AS answers
    FROM survey_responses sr
    JOIN surveys s ON sr.survey_id = s.id
    LEFT JOIN answers a ON a.response_id = sr.id
    LEFT JOIN questions q ON a.question_id = q.id
    WHERE sr.student_id = $1
    GROUP BY sr.id, s.id
    ORDER BY sr.submitted_at DESC;
  `;

  const result = await db.query(queryText, [studentId]);
  return result.rows;
}

module.exports = {
  submitResponse,
  getSurveyResponses,
  getMyResponses,
};
