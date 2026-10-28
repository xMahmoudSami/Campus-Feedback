/**
 * Date utility functions for survey expiration and lifecycle evaluation.
 */

/**
 * Checks whether a survey's due date has passed.
 *
 * Rules:
 * - If dueDate is falsy (null, undefined, ''), survey does not expire (returns false).
 * - If dueDate is a date-only string (e.g. '2026-10-28') or timestamp set to midnight UTC
 *   (e.g. '2026-10-28T00:00:00.000Z'), it represents the full calendar day. The survey
 *   remains available throughout that entire day and expires once the date has ended
 *   (i.e. at 23:59:59.999 UTC).
 * - If dueDate includes a non-zero time (e.g. '2026-10-28T18:00:00.000Z'), it expires at
 *   that exact timestamp.
 * - Handles reference time comparisons safely against timezone differences.
 *
 * @param {string|Date|null} dueDate - The due date to check
 * @param {Date|string|number} [now=new Date()] - Reference time to compare against
 * @returns {boolean} True if expired, false otherwise
 */
function isSurveyExpired(dueDate, now = new Date()) {
  if (!dueDate) return false;

  const due = new Date(dueDate);
  if (isNaN(due.getTime())) return false;

  const current = now instanceof Date ? now : new Date(now);
  if (isNaN(current.getTime())) return false;

  let deadlineTime = due.getTime();

  // If the due date was set at midnight UTC (00:00:00.000Z),
  // it indicates a date-only deadline. Extend through the end of that day.
  const isMidnightUtc =
    due.getUTCHours() === 0 &&
    due.getUTCMinutes() === 0 &&
    due.getUTCSeconds() === 0 &&
    due.getUTCMilliseconds() === 0;

  if (isMidnightUtc) {
    deadlineTime += 86399999; // + (24 * 60 * 60 * 1000 - 1)
  }

  return current.getTime() > deadlineTime;
}

/**
 * Returns effective status taking expiration into account while maintaining
 * distinction from manually closed surveys.
 *
 * @param {string} status - Database status ('draft', 'published', 'closed')
 * @param {string|Date|null} dueDate - Due date
 * @param {Date|string|number} [now=new Date()] - Reference time
 * @returns {string} 'draft' | 'closed' | 'expired' | 'published'
 */
function getEffectiveStatus(status, dueDate, now = new Date()) {
  if (status === 'closed') return 'closed';
  if (status === 'draft') return 'draft';
  if (isSurveyExpired(dueDate, now)) return 'expired';
  return 'published';
}

module.exports = {
  isSurveyExpired,
  getEffectiveStatus,
};

