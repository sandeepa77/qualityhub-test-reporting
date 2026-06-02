/**
 * QualityHub — TestCafe Adapter
 * Converts TestCafe JSON reporter output into Canonical Test Events (CTEs).
 * Author: Sandeepa Marpadga Venkata — Independent Researcher
 */

'use strict';

const { createCTE, TEST_TYPES, STATUSES } = require('../ingestion/cte-schema');

/**
 * Determines the CTE status for a TestCafe test result.
 *
 * TestCafe signals failure via a non-empty errs array.
 * The skipped property is a boolean flag.
 *
 * @param {object} test  - A TestCafe test result object.
 * @returns {string}     - CTE status enum value.
 */
function resolveStatus(test) {
  if (test.skipped === true) return STATUSES.SKIPPED;
  if (Array.isArray(test.errs) && test.errs.length > 0) return STATUSES.FAILED;
  return STATUSES.PASSED;
}

/**
 * Extracts a plain-text error message from the first entry in the errs array.
 *
 * @param {Array} errs
 * @returns {string|null}
 */
function extractError(errs) {
  if (!errs || errs.length === 0) return null;
  const first = errs[0];
  // TestCafe error objects may be strings or objects with a message property
  const raw = typeof first === 'string' ? first : (first.message || JSON.stringify(first));
  return raw.length > 500 ? raw.substring(0, 497) + '...' : raw;
}

/**
 * Parses a TestCafe JSON report and returns an array of CTEs.
 * Each test inside each fixture becomes one CTE.
 *
 * @param {object} report   - Parsed TestCafe JSON report.
 * @param {object} context  - { orgId, teamId, buildId, environment }
 * @returns {Array}         - Array of Canonical Test Event objects.
 */
function parse(report, context) {
  if (!report || typeof report !== 'object') {
    throw new Error('TestCafe report must be a JSON object.');
  }

  const fixtures = Array.isArray(report.fixtures) ? report.fixtures : [];
  const ctes     = [];
  const now      = new Date().toISOString();

  for (const fixture of fixtures) {
    const suiteName = fixture.name || 'Unnamed Fixture';
    const tests     = Array.isArray(fixture.tests) ? fixture.tests : [];

    for (const test of tests) {
      const status       = resolveStatus(test);
      const errorMessage = status === STATUSES.FAILED ? extractError(test.errs) : null;
      const durationMs   = typeof test.durationMs === 'number' ? test.durationMs : 0;

      // Capture screenshot paths in extensions (they do not affect metrics)
      const extensions = {};
      if (test.screenshotPath) {
        extensions.screenshotPath = test.screenshotPath;
      }
      if (Array.isArray(test.screenshots) && test.screenshots.length > 0) {
        extensions.screenshots = test.screenshots.map(s => s.screenshotPath || s);
      }

      ctes.push(createCTE({
        orgId:        context.orgId,
        teamId:       context.teamId,
        testType:     TEST_TYPES.E2E_TESTCAFE,
        suiteName,
        testName:     test.name || 'Unnamed Test',
        status,
        durationMs,
        timestamp:    now,
        environment:  context.environment,
        buildId:      context.buildId,
        errorMessage,
        tags:         [],
        extensions,
      }));
    }
  }

  return ctes;
}

module.exports = { parse };
