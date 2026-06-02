/**
 * QualityHub — Playwright Adapter
 * Converts a Playwright JSON reporter output into Canonical Test Events (CTEs).
 * Author: Sandeepa Marpadga Venkata — Independent Researcher
 */

'use strict';

const { createCTE, TEST_TYPES, STATUSES } = require('../ingestion/cte-schema');

// Map Playwright status strings to CTE status enum values
const STATUS_MAP = {
  passed:   STATUSES.PASSED,
  failed:   STATUSES.FAILED,
  timedOut: STATUSES.FAILED,
  skipped:  STATUSES.SKIPPED,
  pending:  STATUSES.PENDING,
};

/**
 * Recursively walks the Playwright suite tree and collects all test results.
 *
 * @param {object} suite      - A Playwright suite node.
 * @param {string} parentName - Accumulated suite name path.
 * @returns {Array}           - Flat array of { suiteName, testName, results[] }.
 */
function collectTests(suite, parentName = '') {
  const collected = [];
  const suiteName = parentName
    ? `${parentName} > ${suite.title}`
    : suite.title || 'Root';

  // Recurse into child suites
  if (Array.isArray(suite.suites)) {
    for (const child of suite.suites) {
      collected.push(...collectTests(child, suiteName));
    }
  }

  // Collect specs (individual test files) and their tests
  if (Array.isArray(suite.specs)) {
    for (const spec of suite.specs) {
      if (Array.isArray(spec.tests)) {
        for (const test of spec.tests) {
          collected.push({
            suiteName,
            testName: spec.title || test.title || 'Unnamed test',
            results:  test.results || [],
          });
        }
      }
    }
  }

  return collected;
}

/**
 * Deduplicates retry attempts: returns the final result for a test.
 * If the last attempt passed, the test is considered PASSED.
 * Duration is the sum of all attempt durations.
 *
 * @param {Array} results - Array of Playwright result objects for one test.
 * @returns {{ status: string, durationMs: number, errorMessage: string|null }}
 */
function resolveResult(results) {
  if (!results || results.length === 0) {
    return { status: STATUSES.SKIPPED, durationMs: 0, errorMessage: null };
  }

  const last       = results[results.length - 1];
  const status     = STATUS_MAP[last.status] || STATUSES.FAILED;
  const durationMs = results.reduce((sum, r) => sum + (r.duration || 0), 0);

  let errorMessage = null;
  if (status === STATUSES.FAILED) {
    const firstFailing = results.find(r => r.status === 'failed' || r.status === 'timedOut');
    if (firstFailing && Array.isArray(firstFailing.errors) && firstFailing.errors.length > 0) {
      errorMessage = firstFailing.errors[0].message || null;
      // Truncate long stack traces
      if (errorMessage && errorMessage.length > 500) {
        errorMessage = errorMessage.substring(0, 497) + '...';
      }
    }
  }

  return { status, durationMs, errorMessage };
}

/**
 * Parses a Playwright JSON reporter output and returns an array of CTEs.
 *
 * @param {object} report   - Parsed Playwright JSON report object.
 * @param {object} context  - { orgId, teamId, buildId, environment }
 * @returns {Array}         - Array of Canonical Test Event objects.
 */
function parse(report, context) {
  if (!report || typeof report !== 'object') {
    throw new Error('Playwright report must be a JSON object.');
  }

  const suites = Array.isArray(report.suites) ? report.suites : [];
  const ctes   = [];
  const now    = new Date().toISOString();

  for (const suite of suites) {
    const tests = collectTests(suite);

    for (const { suiteName, testName, results } of tests) {
      const { status, durationMs, errorMessage } = resolveResult(results);

      ctes.push(createCTE({
        orgId:        context.orgId,
        teamId:       context.teamId,
        testType:     TEST_TYPES.E2E_PLAYWRIGHT,
        suiteName,
        testName,
        status,
        durationMs,
        timestamp:    now,
        environment:  context.environment,
        buildId:      context.buildId,
        errorMessage,
        tags:         [],
      }));
    }
  }

  return ctes;
}

module.exports = { parse };
