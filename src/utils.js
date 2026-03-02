'use strict';

/**
 * Group an array of result objects by their `file` property.
 */
function groupByFile(results) {
  const grouped = {};
  for (const r of results) {
    if (!grouped[r.file]) grouped[r.file] = [];
    grouped[r.file].push(r);
  }
  return grouped;
}

/**
 * Count occurrences by a given key in an array of objects.
 * @param {string} fallback - value to use when key is missing (default: 'unknown')
 */
function countByKey(results, key, fallback = 'unknown') {
  const counts = {};
  for (const r of results) {
    const val = r[key] || fallback;
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

module.exports = { groupByFile, countByKey };
