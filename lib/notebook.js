// lib/notebook.js — pure notebook projection over Intake's Thought records.

/**
 * Group Thoughts into their source daily notes while preserving the input
 * order of both days and thoughts. Intake returns Thoughts newest-first, so
 * passing `model.thoughts` produces newest-first notebook days without any
 * presentation module needing to know about timestamps or vault paths.
 *
 * The returned day objects deliberately expose only the day grouping key and
 * its Thoughts. `sourceRel` remains on each Thought as provenance for callers
 * that need it, but is not presentation copy.
 *
 * @param {Array<{ sourceDate: string }>} thoughts Intake Thought records
 * @returns {Array<{ date: string, thoughts: object[] }>}
 */
export function projectNotebookDays(thoughts) {
  const days = [];
  const byDate = new Map();

  for (const thought of thoughts) {
    let day = byDate.get(thought.sourceDate);
    if (!day) {
      day = { date: thought.sourceDate, thoughts: [] };
      byDate.set(thought.sourceDate, day);
      days.push(day);
    }
    day.thoughts.push(thought);
  }

  return days;
}
