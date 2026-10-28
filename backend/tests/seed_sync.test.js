const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const db = require('../src/config/db');
const seedModule = require('../src/scripts/seed');
const { exportSeedData, hashContent } = require('../src/scripts/exportSeed');
const { importSeedData } = require('../src/scripts/importSeed');

describe('Safe Database Seed Merging & Multi-Developer Synchronization', () => {
  let tempDir;
  let mockState;

  function createInitialMockState() {
    return {
      users: [
        { id: 1, username: 'admin', email: 'admin@example.com', role: 'admin' },
        { id: 2, username: 'student', email: 'student@example.com', role: 'student' },
        { id: 99, username: 'real_user', email: 'real@example.com', role: 'student' },
      ],
      surveys: [],
      questions: [],
      feedback: [],
      seed_import_map: [], // { entity_type, entity_uuid, local_id, content_hash }
      sequences: {
        surveys_id_seq: 1,
        questions_id_seq: 1,
        feedback_id_seq: 1,
      },
      nextId: {
        surveys: 1,
        questions: 1,
        feedback: 1,
      },
    };
  }

  function mockDbClient(state) {
    return {
      query: vi.fn().mockImplementation(async (sql, params = []) => {
        const cleanSql = sql.replace(/\s+/g, ' ').trim();

        // 1. Schema check/creation
        if (cleanSql.includes('CREATE TABLE IF NOT EXISTS seed_import_map')) {
          return { rows: [] };
        }
        if (cleanSql.includes('CREATE INDEX IF NOT EXISTS')) {
          return { rows: [] };
        }

        // Demo user check/creation
        if (cleanSql.includes('FROM users') && cleanSql.includes('LOWER(username)')) {
          const [username, email] = params;
          const matched = state.users.filter(
            (u) =>
              (u.username && u.username.toLowerCase() === username.toLowerCase()) ||
              (u.email && u.email.toLowerCase() === email.toLowerCase())
          );
          return {
            rows: matched.map((u) => ({
              id: u.id,
              full_name: u.full_name || u.username,
              username: u.username,
              email: u.email,
              role: u.role,
              created_at: new Date().toISOString(),
            })),
          };
        }

        if (cleanSql.includes('INSERT INTO users')) {
          const [fullName, email, username, passwordHash, role] = params;
          const newUser = {
            id: state.users.length + 1,
            full_name: fullName,
            email,
            username,
            role,
            created_at: new Date().toISOString(),
          };
          state.users.push(newUser);
          return { rows: [newUser] };
        }

        // 2. seed_import_map lookup
        if (cleanSql.includes('FROM seed_import_map') && cleanSql.includes('entity_uuid = $1')) {
          let entityType = 'surveys';
          if (cleanSql.includes("'questions'")) entityType = 'questions';
          if (cleanSql.includes("'feedback'")) entityType = 'feedback';
          const [entityUuid] = params;
          const found = state.seed_import_map.filter(
            (m) => m.entity_type === entityType && m.entity_uuid === entityUuid
          );
          return { rows: found.map((r) => ({ local_id: r.local_id, content_hash: r.content_hash })) };
        }

        if (cleanSql.includes('SELECT entity_type, entity_uuid, local_id FROM seed_import_map')) {
          return { rows: state.seed_import_map.map((r) => ({ entity_type: r.entity_type, entity_uuid: r.entity_uuid, local_id: r.local_id })) };
        }

        // 3. seed_import_map insert/update
        if (cleanSql.includes('INSERT INTO seed_import_map')) {
          let entityType = 'surveys';
          if (cleanSql.includes("'questions'")) entityType = 'questions';
          if (cleanSql.includes("'feedback'")) entityType = 'feedback';

          const [entityUuid, localId, contentHash] = params;
          const existingIdx = state.seed_import_map.findIndex(
            (m) => m.entity_type === entityType && m.entity_uuid === entityUuid
          );
          if (existingIdx >= 0) {
            state.seed_import_map[existingIdx].local_id = localId;
            state.seed_import_map[existingIdx].content_hash = contentHash;
          } else {
            state.seed_import_map.push({
              entity_type: entityType,
              entity_uuid: entityUuid,
              local_id: localId,
              content_hash: contentHash,
            });
          }
          return { rows: [] };
        }

        if (cleanSql.includes('UPDATE seed_import_map SET content_hash = $1')) {
          const [contentHash, entityUuid] = params;
          let entityType = 'surveys';
          if (cleanSql.includes("'questions'")) entityType = 'questions';
          if (cleanSql.includes("'feedback'")) entityType = 'feedback';
          const found = state.seed_import_map.find(
            (m) => m.entity_type === entityType && m.entity_uuid === entityUuid
          );
          if (found) {
            found.content_hash = contentHash;
          }
          return { rows: [] };
        }

        // 4. Surveys Queries
        if (cleanSql.includes('SELECT id, title, description, status, due_date FROM surveys WHERE id = $1')) {
          const surveyId = params[0];
          const found = state.surveys.filter((s) => s.id === surveyId);
          return { rows: found };
        }

        if (cleanSql.includes('SELECT id FROM surveys WHERE id = $1')) {
          const surveyId = params[0];
          const found = state.surveys.filter((s) => s.id === surveyId);
          return { rows: found.map((s) => ({ id: s.id })) };
        }

        if (cleanSql.includes('SELECT s.*, u.role as creator_role FROM surveys s JOIN users u')) {
          const approved = state.surveys
            .filter((s) => {
              const u = state.users.find((u) => u.id === s.created_by);
              return u && u.role === 'admin';
            })
            .map((s) => ({ ...s, creator_role: 'admin' }));
          return { rows: approved };
        }

        if (cleanSql.includes('INSERT INTO surveys (id,')) {
          // Explicit ID insert
          const [id, title, description, status, created_by, due_date, created_at, published_at, closed_at] = params;
          const newSurvey = {
            id: Number(id),
            title,
            description,
            status,
            created_by,
            due_date,
            created_at,
            published_at,
            closed_at,
          };
          state.surveys.push(newSurvey);
          state.nextId.surveys = Math.max(state.nextId.surveys, Number(id) + 1);
          return { rows: [{ id: newSurvey.id }] };
        }

        if (cleanSql.includes('INSERT INTO surveys (title,')) {
          // Allocated sequence ID insert
          const [title, description, status, created_by, due_date, created_at, published_at, closed_at] = params;
          const assignedId = state.nextId.surveys++;
          const newSurvey = {
            id: assignedId,
            title,
            description,
            status,
            created_by,
            due_date,
            created_at,
            published_at,
            closed_at,
          };
          state.surveys.push(newSurvey);
          return { rows: [{ id: assignedId }] };
        }

        if (cleanSql.includes('UPDATE surveys SET title = $1')) {
          const [title, description, status, due_date, published_at, closed_at, targetLocalId] = params;
          const survey = state.surveys.find((s) => s.id === targetLocalId);
          if (survey) {
            survey.title = title;
            survey.description = description;
            survey.status = status;
            survey.due_date = due_date;
            survey.published_at = published_at;
            survey.closed_at = closed_at;
          }
          return { rows: [] };
        }

        // 5. Questions Queries
        if (cleanSql.includes('SELECT id, survey_id, question_text, question_type, options, position, is_required FROM questions WHERE survey_id = ANY($1)')) {
          const surveyIds = params[0] || [];
          const matched = state.questions.filter((q) => surveyIds.includes(q.survey_id));
          return { rows: matched };
        }

        if (cleanSql.includes('SELECT id, question_text, question_type, options, position, is_required FROM questions WHERE id = $1')) {
          const qId = params[0];
          const matched = state.questions.filter((q) => q.id === qId);
          return { rows: matched };
        }

        if (cleanSql.includes('SELECT id FROM questions WHERE id = $1')) {
          const qId = params[0];
          const matched = state.questions.filter((q) => q.id === qId);
          return { rows: matched.map((q) => ({ id: q.id })) };
        }

        if (cleanSql.includes('INSERT INTO questions (id,')) {
          const [id, survey_id, question_text, question_type, options, position, is_required] = params;
          const newQ = {
            id: Number(id),
            survey_id,
            question_text,
            question_type,
            options: typeof options === 'string' ? JSON.parse(options) : options,
            position,
            is_required,
          };
          state.questions.push(newQ);
          state.nextId.questions = Math.max(state.nextId.questions, Number(id) + 1);
          return { rows: [{ id: newQ.id }] };
        }

        if (cleanSql.includes('INSERT INTO questions (survey_id,')) {
          const [survey_id, question_text, question_type, options, position, is_required] = params;
          const assignedId = state.nextId.questions++;
          const newQ = {
            id: assignedId,
            survey_id,
            question_text,
            question_type,
            options: typeof options === 'string' ? JSON.parse(options) : options,
            position,
            is_required,
          };
          state.questions.push(newQ);
          return { rows: [{ id: assignedId }] };
        }

        if (cleanSql.includes('UPDATE questions SET question_text = $1')) {
          const [question_text, question_type, options, position, is_required, survey_id, targetQuestionId] = params;
          const q = state.questions.find((x) => x.id === targetQuestionId);
          if (q) {
            q.question_text = question_text;
            q.question_type = question_type;
            q.options = typeof options === 'string' ? JSON.parse(options) : options;
            q.position = position;
            q.is_required = is_required;
            q.survey_id = survey_id;
          }
          return { rows: [] };
        }

        // 6. Feedback Queries
        if (cleanSql.includes('FROM feedback f JOIN users u ON f.student_id = u.id WHERE u.username = \'student\'')) {
          const demoFeedback = state.feedback.filter((f) => {
            const u = state.users.find((u) => u.id === f.student_id);
            return u && u.username === 'student';
          });
          return { rows: demoFeedback };
        }

        if (cleanSql.includes('SELECT id, message, rating FROM feedback WHERE id = $1')) {
          const fId = params[0];
          const matched = state.feedback.filter((f) => f.id === fId);
          return { rows: matched };
        }

        if (cleanSql.includes('SELECT id FROM feedback WHERE id = $1')) {
          const fId = params[0];
          const matched = state.feedback.filter((f) => f.id === fId);
          return { rows: matched.map((f) => ({ id: f.id })) };
        }

        if (cleanSql.includes('INSERT INTO feedback (id,')) {
          const [id, student_id, survey_id, message, rating, created_at] = params;
          const newF = {
            id: Number(id),
            student_id,
            survey_id,
            message,
            rating,
            created_at,
          };
          state.feedback.push(newF);
          state.nextId.feedback = Math.max(state.nextId.feedback, Number(id) + 1);
          return { rows: [{ id: newF.id }] };
        }

        if (cleanSql.includes('INSERT INTO feedback (student_id,')) {
          const [student_id, survey_id, message, rating, created_at] = params;
          const assignedId = state.nextId.feedback++;
          const newF = {
            id: assignedId,
            student_id,
            survey_id,
            message,
            rating,
            created_at,
          };
          state.feedback.push(newF);
          return { rows: [{ id: assignedId }] };
        }

        if (cleanSql.includes('UPDATE feedback SET message = $1')) {
          const [message, rating, survey_id, targetFeedbackId] = params;
          const f = state.feedback.find((x) => x.id === targetFeedbackId);
          if (f) {
            f.message = message;
            f.rating = rating;
            f.survey_id = survey_id;
          }
          return { rows: [] };
        }

        // 7. Sequence alignment
        if (cleanSql.includes("SELECT setval('surveys_id_seq'")) {
          const maxId = state.surveys.length > 0 ? Math.max(...state.surveys.map((s) => s.id)) : 1;
          state.sequences.surveys_id_seq = maxId;
          return { rows: [{ setval: maxId }] };
        }
        if (cleanSql.includes("SELECT setval('questions_id_seq'")) {
          const maxId = state.questions.length > 0 ? Math.max(...state.questions.map((q) => q.id)) : 1;
          state.sequences.questions_id_seq = maxId;
          return { rows: [{ setval: maxId }] };
        }
        if (cleanSql.includes("SELECT setval('feedback_id_seq'")) {
          const maxId = state.feedback.length > 0 ? Math.max(...state.feedback.map((f) => f.id)) : 1;
          state.sequences.feedback_id_seq = maxId;
          return { rows: [{ setval: maxId }] };
        }

        return { rows: [] };
      }),
      release: vi.fn(),
    };
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-sync-test-'));
    mockState = createInitialMockState();

    vi.spyOn(seedModule, 'seedDatabase').mockResolvedValue({
      admin: { id: 1, username: 'admin', email: 'admin@example.com', role: 'admin' },
      student: { id: 2, username: 'student', email: 'student@example.com', role: 'student' },
    });

    vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
      const client = mockDbClient(mockState);
      return await callback(client);
    });

    vi.spyOn(db, 'getClient').mockImplementation(async () => {
      return mockDbClient(mockState);
    });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // =========================================================================
  // SCENARIO 1: Merging two different surveys with the same numeric ID
  // Developer A has Survey 2: 'Student Satisfaction'
  // Developer B has Survey 2: 'Course Evaluation'
  // Result: both exist in B's database, B's survey is untouched, A's survey gets a new local ID.
  // =========================================================================
  it('Scenario 1: should merge two different surveys with identical numeric ID 2 safely without overwriting', async () => {
    // Initial Developer B database state:
    // B already has Survey ID 2: "Course Evaluation"
    mockState.surveys.push({
      id: 2,
      title: 'Course Evaluation',
      description: "Developer B's local survey",
      status: 'published',
      created_by: 1,
    });
    mockState.nextId.surveys = 3;

    // Incoming seed from Developer A contains Survey with source_id 2: "Student Satisfaction"
    const seedPath = path.join(tempDir, 'dev_a_seed.json');
    const incomingSeed = {
      version: '2.0',
      surveys: [
        {
          uuid: 'uuid-survey-dev-a',
          source_id: 2,
          title: 'Student Satisfaction',
          description: "Developer A's survey",
          status: 'published',
          creator_role: 'admin',
        },
      ],
      questions: [],
      feedback: [],
    };
    fs.writeFileSync(seedPath, JSON.stringify(incomingSeed, null, 2));

    const result = await importSeedData(seedPath);

    expect(result.surveys.inserted).toBe(1);

    // Verify Developer B's database now contains BOTH surveys
    expect(mockState.surveys.length).toBe(2);

    // Verify Developer B's existing survey ID 2 is completely unchanged
    const survey2 = mockState.surveys.find((s) => s.id === 2);
    expect(survey2).toBeDefined();
    expect(survey2.title).toBe('Course Evaluation');
    expect(survey2.description).toBe("Developer B's local survey");

    // Verify Developer A's survey was allocated a new local ID (ID 3)
    const importedSurvey = mockState.surveys.find((s) => s.id === 3);
    expect(importedSurvey).toBeDefined();
    expect(importedSurvey.title).toBe('Student Satisfaction');
    expect(importedSurvey.description).toBe("Developer A's survey");

    // Verify mapping is registered in seed_import_map
    const mapEntry = mockState.seed_import_map.find(
      (m) => m.entity_type === 'surveys' && m.entity_uuid === 'uuid-survey-dev-a'
    );
    expect(mapEntry).toBeDefined();
    expect(mapEntry.local_id).toBe(3);
  });

  // =========================================================================
  // SCENARIO 2: Questions belonging to an imported survey whose ID was reallocated
  // are correctly mapped to the new local survey ID
  // =========================================================================
  it('Scenario 2: should map questions to the newly allocated local survey ID instead of source survey ID', async () => {
    // B has survey 2
    mockState.surveys.push({
      id: 2,
      title: 'Course Evaluation',
      status: 'published',
      created_by: 1,
    });
    mockState.nextId.surveys = 3;

    const seedPath = path.join(tempDir, 'seed_with_questions.json');
    const incomingSeed = {
      version: '2.0',
      surveys: [
        {
          uuid: 'uuid-survey-dev-a',
          source_id: 2,
          title: 'Student Satisfaction',
          status: 'published',
        },
      ],
      questions: [
        {
          uuid: 'uuid-question-a1',
          source_id: 10,
          source_survey_id: 2,
          survey_uuid: 'uuid-survey-dev-a',
          question_text: 'How satisfied are you with campus amenities?',
          question_type: 'rating',
          position: 1,
          is_required: true,
        },
      ],
      feedback: [],
    };
    fs.writeFileSync(seedPath, JSON.stringify(incomingSeed, null, 2));

    const result = await importSeedData(seedPath);

    expect(result.surveys.inserted).toBe(1);
    expect(result.questions.inserted).toBe(1);

    // Survey was reallocated to ID 3
    const importedSurvey = mockState.surveys.find((s) => s.title === 'Student Satisfaction');
    expect(importedSurvey.id).toBe(3);

    // Question MUST point to survey_id 3, NOT source_survey_id 2!
    const importedQuestion = mockState.questions.find((q) => q.question_text.includes('satisfied'));
    expect(importedQuestion).toBeDefined();
    expect(importedQuestion.survey_id).toBe(3);
    expect(importedQuestion.survey_id).not.toBe(2);
  });

  // =========================================================================
  // SCENARIO 3: Feedback referencing an imported survey whose ID was reallocated
  // is correctly mapped to the new local survey ID and the approved student user
  // =========================================================================
  it('Scenario 3: should map feedback to the newly allocated local survey ID and demo student account', async () => {
    mockState.surveys.push({
      id: 2,
      title: 'Course Evaluation',
      status: 'published',
      created_by: 1,
    });
    mockState.nextId.surveys = 3;

    const seedPath = path.join(tempDir, 'seed_with_feedback.json');
    const incomingSeed = {
      version: '2.0',
      surveys: [
        {
          uuid: 'uuid-survey-dev-a',
          source_id: 2,
          title: 'Student Satisfaction',
          status: 'published',
        },
      ],
      questions: [],
      feedback: [
        {
          uuid: 'uuid-feedback-a1',
          source_id: 25,
          source_survey_id: 2,
          survey_uuid: 'uuid-survey-dev-a',
          message: 'The cafeteria has improved noticeably.',
          rating: 4,
        },
      ],
    };
    fs.writeFileSync(seedPath, JSON.stringify(incomingSeed, null, 2));

    const result = await importSeedData(seedPath);

    expect(result.feedback.inserted).toBe(1);

    const importedFeedback = mockState.feedback.find((f) => f.message.includes('cafeteria'));
    expect(importedFeedback).toBeDefined();
    // Reallocated survey ID is 3
    expect(importedFeedback.survey_id).toBe(3);
    // Student ID must be official demo student (ID 2), never an arbitrary account
    expect(importedFeedback.student_id).toBe(2);
    expect(importedFeedback.rating).toBe(4);
  });

  // =========================================================================
  // SCENARIO 4: Importing the same seed file twice does not create duplicate
  // surveys, questions, or feedback (Idempotency)
  // =========================================================================
  it('Scenario 4: should be idempotent and produce zero duplicate records on repeated imports', async () => {
    const seedPath = path.join(tempDir, 'idempotent_seed.json');
    const seedData = {
      version: '2.0',
      surveys: [
        {
          uuid: 'uuid-survey-stem',
          source_id: 1,
          title: 'STEM Curriculum Review',
          description: 'Feedback on engineering courses',
          status: 'published',
        },
      ],
      questions: [
        {
          uuid: 'uuid-q-stem-1',
          source_id: 1,
          survey_uuid: 'uuid-survey-stem',
          question_text: 'Are lab facilities adequate?',
          question_type: 'boolean',
          position: 1,
          is_required: true,
        },
      ],
      feedback: [
        {
          uuid: 'uuid-f-stem-1',
          source_id: 1,
          survey_uuid: 'uuid-survey-stem',
          message: 'More GPU servers needed in lab.',
          rating: 3,
        },
      ],
    };
    fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2));

    // First import
    const firstRun = await importSeedData(seedPath);
    expect(firstRun.surveys.inserted).toBe(1);
    expect(firstRun.questions.inserted).toBe(1);
    expect(firstRun.feedback.inserted).toBe(1);
    expect(mockState.surveys.length).toBe(1);
    expect(mockState.questions.length).toBe(1);
    expect(mockState.feedback.length).toBe(1);

    // Second import of the identical seed file
    const secondRun = await importSeedData(seedPath);
    expect(secondRun.surveys.inserted).toBe(0);
    expect(secondRun.surveys.preserved).toBe(1);
    expect(secondRun.questions.inserted).toBe(0);
    expect(secondRun.questions.preserved).toBe(1);
    expect(secondRun.feedback.inserted).toBe(0);
    expect(secondRun.feedback.preserved).toBe(1);

    // Counts in database must remain exactly 1 each - NO DUPLICATES
    expect(mockState.surveys.length).toBe(1);
    expect(mockState.questions.length).toBe(1);
    expect(mockState.feedback.length).toBe(1);
  });

  // =========================================================================
  // SCENARIO 5: Modifying locally imported survey vs modifying incoming seed file
  // (Three-way merge: local changes preserved, remote changes applied, conflicts rejected)
  // =========================================================================
  describe('Scenario 5: Three-way merge and conflict handling', () => {
    const surveyUuid = 'uuid-survey-merge-test';
    let baseSeed;
    let seedPath;

    beforeEach(() => {
      seedPath = path.join(tempDir, 'merge_seed.json');
      baseSeed = {
        version: '2.0',
        surveys: [
          {
            uuid: surveyUuid,
            source_id: 10,
            title: 'Campus Housing Feedback',
            description: 'Original description',
            status: 'draft',
          },
        ],
        questions: [],
        feedback: [],
      };
    });

    it('5a: should preserve local modifications when incoming seed has not changed', async () => {
      fs.writeFileSync(seedPath, JSON.stringify(baseSeed, null, 2));
      await importSeedData(seedPath);

      // Developer makes local modifications in their database
      const localSurvey = mockState.surveys.find((s) => s.title === 'Campus Housing Feedback');
      localSurvey.title = 'Local Developer Customized Title';
      localSurvey.description = 'Local developer notes';

      // Re-importing original seed should NOT overwrite local developer changes
      const secondRun = await importSeedData(seedPath);
      expect(secondRun.surveys.preserved).toBe(1);
      expect(secondRun.surveys.updated).toBe(0);

      const verified = mockState.surveys.find((s) => s.id === localSurvey.id);
      expect(verified.title).toBe('Local Developer Customized Title');
      expect(verified.description).toBe('Local developer notes');
    });

    it('5b: should safely update local survey when incoming seed changed and local was untouched', async () => {
      fs.writeFileSync(seedPath, JSON.stringify(baseSeed, null, 2));
      await importSeedData(seedPath);

      // Teammate publishes an update in the seed file (e.g. status published, updated description)
      const updatedSeed = {
        ...baseSeed,
        surveys: [
          {
            uuid: surveyUuid,
            source_id: 10,
            title: 'Campus Housing Feedback (Updated by Teammate)',
            description: 'New updated guidelines for housing survey',
            status: 'published',
          },
        ],
      };
      fs.writeFileSync(seedPath, JSON.stringify(updatedSeed, null, 2));

      // Import incoming updates
      const updateRun = await importSeedData(seedPath);
      expect(updateRun.surveys.updated).toBe(1);

      const updatedSurvey = mockState.surveys.find((s) => s.title.includes('Updated by Teammate'));
      expect(updatedSurvey).toBeDefined();
      expect(updatedSurvey.description).toBe('New updated guidelines for housing survey');
      expect(updatedSurvey.status).toBe('published');
    });

    it('5c: should reject and rollback transaction when both local record and incoming seed were modified (Conflict)', async () => {
      fs.writeFileSync(seedPath, JSON.stringify(baseSeed, null, 2));
      await importSeedData(seedPath);

      // 1. Local modification
      const localSurvey = mockState.surveys.find((s) => s.title === 'Campus Housing Feedback');
      localSurvey.title = 'Local Developer Conflict Title';

      // 2. Incoming seed modification
      const conflictingSeed = {
        ...baseSeed,
        surveys: [
          {
            uuid: surveyUuid,
            source_id: 10,
            title: 'Remote Teammate Conflict Title',
            description: 'Remote change',
            status: 'published',
          },
        ],
      };
      fs.writeFileSync(seedPath, JSON.stringify(conflictingSeed, null, 2));

      // Import MUST throw a descriptive Conflict error and rollback
      await expect(importSeedData(seedPath)).rejects.toThrow(/Conflict detected for survey/);

      // Verify local survey title remained untouched by the aborted transaction
      expect(localSurvey.title).toBe('Local Developer Conflict Title');
    });
  });

  // =========================================================================
  // SCENARIO 6: Existing local surveys and users created outside the seed file
  // are not deleted, overwritten, or corrupted
  // =========================================================================
  it('Scenario 6: should keep existing unrelated surveys, users, and feedback intact', async () => {
    // Existing database contains unrelated records created by local devs
    mockState.surveys.push(
      { id: 100, title: 'Private Department Review', status: 'draft', created_by: 1 },
      { id: 101, title: 'Secret Faculty Poll', status: 'closed', created_by: 1 }
    );
    mockState.feedback.push({
      id: 50,
      student_id: 99, // created by real user 99
      survey_id: 100,
      message: 'Private feedback',
      rating: 5,
    });
    mockState.nextId.surveys = 102;
    mockState.nextId.feedback = 51;

    const seedPath = path.join(tempDir, 'seed.json');
    const seedData = {
      version: '2.0',
      surveys: [
        {
          uuid: 'uuid-new-seed-survey',
          source_id: 1,
          title: 'Public Campus Dining Poll',
          status: 'published',
        },
      ],
      questions: [],
      feedback: [],
    };
    fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2));

    await importSeedData(seedPath);

    // Verify existing surveys 100 and 101 still exist completely untouched
    expect(mockState.surveys.find((s) => s.id === 100).title).toBe('Private Department Review');
    expect(mockState.surveys.find((s) => s.id === 101).title).toBe('Secret Faculty Poll');

    // Verify private feedback 50 still exists untouched
    expect(mockState.feedback.find((f) => f.id === 50).message).toBe('Private feedback');

    // Verify real user 99 is preserved
    expect(mockState.users.find((u) => u.id === 99)).toBeDefined();
  });

  // =========================================================================
  // SCENARIO 7: Transaction rollback on failure
  // =========================================================================
  it('Scenario 7: should rollback entire transaction if an insert or relationship mapping fails', async () => {
    const seedPath = path.join(tempDir, 'broken_seed.json');
    const brokenSeed = {
      version: '2.0',
      surveys: [
        {
          uuid: 'uuid-survey-rollback',
          source_id: 55,
          title: 'Will Roll Back',
          status: 'draft',
        },
      ],
      questions: [
        {
          uuid: 'uuid-q-broken',
          source_id: 99,
          // Missing or unresolvable survey reference will trigger an exception
          survey_uuid: 'non-existent-survey-uuid',
          source_survey_id: 9999,
          question_text: 'Orphan question',
          question_type: 'text',
        },
      ],
      feedback: [],
    };
    fs.writeFileSync(seedPath, JSON.stringify(brokenSeed, null, 2));

    const initialSurveyCount = mockState.surveys.length;

    // Use withTransaction simulation that tracks rollback
    vi.spyOn(db, 'withTransaction').mockImplementation(async (callback) => {
      const snapshot = JSON.stringify(mockState);
      const client = mockDbClient(mockState);
      try {
        return await callback(client);
      } catch (err) {
        // Rollback state to snapshot
        const restored = JSON.parse(snapshot);
        mockState.surveys = restored.surveys;
        mockState.questions = restored.questions;
        mockState.feedback = restored.feedback;
        mockState.seed_import_map = restored.seed_import_map;
        throw err;
      }
    });

    await expect(importSeedData(seedPath)).rejects.toThrow(/Cannot import question 'Orphan question'/);

    // Verify rollback: Survey "Will Roll Back" must NOT be in the database
    expect(mockState.surveys.length).toBe(initialSurveyCount);
    expect(mockState.surveys.find((s) => s.title === 'Will Roll Back')).toBeUndefined();
  });

  // =========================================================================
  // SCENARIO 8: PostgreSQL sequences are correctly aligned after import
  // =========================================================================
  it('Scenario 8: should synchronize PostgreSQL sequences to the highest assigned primary key', async () => {
    const seedPath = path.join(tempDir, 'seq_seed.json');
    const seedData = {
      version: '2.0',
      surveys: [
        { uuid: 'uuid-s-40', source_id: 40, title: 'Survey 40', status: 'draft' },
        { uuid: 'uuid-s-41', source_id: 41, title: 'Survey 41', status: 'draft' },
      ],
      questions: [
        { uuid: 'uuid-q-80', source_id: 80, survey_uuid: 'uuid-s-40', question_text: 'Q80', question_type: 'text' },
      ],
      feedback: [
        { uuid: 'uuid-f-90', source_id: 90, survey_uuid: 'uuid-s-40', message: 'F90' },
      ],
    };
    fs.writeFileSync(seedPath, JSON.stringify(seedData, null, 2));

    await importSeedData(seedPath);

    // Sequence for surveys must be aligned to at least 41
    expect(mockState.sequences.surveys_id_seq).toBe(41);
    // Sequence for questions must be aligned to at least 80
    expect(mockState.sequences.questions_id_seq).toBe(80);
    // Sequence for feedback must be aligned to at least 90
    expect(mockState.sequences.feedback_id_seq).toBe(90);
  });

  // =========================================================================
  // SCENARIO 9: Empty seed arrays or malformed JSON seed files handled gracefully
  // =========================================================================
  describe('Scenario 9: Graceful handling of empty or malformed seed files', () => {
    it('9a: should safely process empty arrays without errors', async () => {
      const seedPath = path.join(tempDir, 'empty_seed.json');
      fs.writeFileSync(seedPath, JSON.stringify({ version: '2.0', surveys: [], questions: [], feedback: [] }));

      const result = await importSeedData(seedPath);
      expect(result.surveys.inserted).toBe(0);
      expect(result.questions.inserted).toBe(0);
      expect(result.feedback.inserted).toBe(0);
    });

    it('9b: should reject non-existent seed file path with clear error', async () => {
      const nonExistentPath = path.join(tempDir, 'does_not_exist.json');
      await expect(importSeedData(nonExistentPath)).rejects.toThrow(/Seed data file not found/);
    });

    it('9c: should reject malformed JSON file with clear parsing error', async () => {
      const brokenJsonPath = path.join(tempDir, 'invalid.json');
      fs.writeFileSync(brokenJsonPath, 'NOT_VALID_JSON{{{');
      await expect(importSeedData(brokenJsonPath)).rejects.toThrow(/Failed to parse JSON/);
    });

    it('9d: should reject seed file whose root is not an object', async () => {
      const arrayJsonPath = path.join(tempDir, 'array_root.json');
      fs.writeFileSync(arrayJsonPath, JSON.stringify(['not', 'an', 'object']));
      await expect(importSeedData(arrayJsonPath)).rejects.toThrow(/Root must be a valid JSON object/);
    });
  });

  // =========================================================================
  // SCENARIO 10: Export safety - exports only approved development/test data
  // and excludes real user data, credentials, and unrelated surveys
  // =========================================================================
  describe('Scenario 10: Export safety and data privacy', () => {
    it('should export approved surveys, exclude non-admin surveys, and never leak credentials', async () => {
      // Setup DB state:
      // - 1 survey created by admin (approved for export)
      // - 1 survey created by real_user 99 (must NOT be exported)
      mockState.surveys.push(
        { id: 1, title: 'Approved Admin Survey', description: 'Official dev survey', status: 'published', created_by: 1 },
        { id: 2, title: 'Private User Survey', description: 'User personal survey', status: 'draft', created_by: 99 }
      );
      // Question for approved survey
      mockState.questions.push({
        id: 1,
        survey_id: 1,
        question_text: 'Admin approved question',
        question_type: 'rating',
        options: null,
        position: 1,
        is_required: true,
      });
      // Question for private survey (must NOT be exported)
      mockState.questions.push({
        id: 2,
        survey_id: 2,
        question_text: 'Private unapproved question',
        question_type: 'text',
        options: null,
        position: 1,
        is_required: false,
      });
      // Feedback from demo student (approved)
      mockState.feedback.push({
        id: 1,
        student_id: 2, // demo student
        survey_id: 1,
        message: 'Demo student approved feedback',
        rating: 5,
        created_at: new Date().toISOString(),
      });
      // Feedback from real user 99 (must NOT be exported)
      mockState.feedback.push({
        id: 2,
        student_id: 99, // real user
        survey_id: 1,
        message: 'Real user confidential feedback',
        rating: 1,
        created_at: new Date().toISOString(),
      });

      const exportOutputPath = path.join(tempDir, 'exported_dev_seed.json');
      const exported = await exportSeedData({ outputPath: exportOutputPath });

      // 1. Only approved admin surveys are exported
      expect(exported.surveys.length).toBe(1);
      expect(exported.surveys[0].title).toBe('Approved Admin Survey');
      expect(exported.surveys.find((s) => s.title === 'Private User Survey')).toBeUndefined();

      // 2. Only questions belonging to exported surveys are exported
      expect(exported.questions.length).toBe(1);
      expect(exported.questions[0].question_text).toBe('Admin approved question');
      expect(exported.questions.find((q) => q.question_text === 'Private unapproved question')).toBeUndefined();

      // 3. Only feedback from official demo student is exported; real user feedback excluded
      expect(exported.feedback.length).toBe(1);
      expect(exported.feedback[0].message).toBe('Demo student approved feedback');
      expect(exported.feedback.find((f) => f.message === 'Real user confidential feedback')).toBeUndefined();

      // 4. Verify file written to disk contains no credentials
      const fileRaw = fs.readFileSync(exportOutputPath, 'utf8');
      expect(fileRaw).not.toContain('password');
      expect(fileRaw).not.toContain('password_hash');
      expect(fileRaw).not.toContain('jwt');
      expect(fileRaw).not.toContain('real@example.com');
    });
  });
});
