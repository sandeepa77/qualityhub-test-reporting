/**
 * QualityHub — Cucumber / BDD Adapter
 * Converts Cucumber JSON output into Canonical Test Events (CTEs).
 * Author: Sandeepa Marpadga Venkata — Independent Researcher
 */

'use strict';

const { createCTE, TEST_TYPES, STATUSES } = require('../ingestion/cte-schema');

/**
 * Derives a CTE status from an array of Cucumber step results.
 * A scenario is PASSED only when every step passes.
 * Any failing or undefined step makes the scenario FAILED.
 * If no steps ran the scenario is SKIPPED.
 *
 * @param {Array} steps  - Cucumber step objects with a result.status field.
 * @returns {string}     - CTE status enum value.
 */
function resolveScenarioStatus(steps) {
  if (!steps || steps.length === 0) return STATUSES.SKIPPED;

  const statuses = steps.map(s => (s.result && s.result.status) || 'skipped');

  if (statuses.some(s => s === 'failed' || s === 'undefined' || s === 'ambiguous')) {
    return STATUSES.FAILED;
  }
  if (statuses.every(s => s === 'passed')) {
    return STATUSES.PASSED;
  }
  return STATUSES.SKIPPED;
}

/**
 * Extracts an error message from the first failing step in a scenario.
 *
 * @param {Array} steps
 * @returns {string|null}
 */
function extractError(steps) {
  if (!steps) return null;
  const failing = steps.find(s => s.result && s.result.status === 'failed');
  if (!failing || !failing.result.error_message) return null;
  const msg = failing.result.error_message;
  return msg.length > 500 ? msg.substring(0, 497) + '...' : msg;
}

/**
 * Sums the duration of all steps in a scenario.
 * Cucumber reports step durations in nanoseconds.
 *
 * @param {Array} steps
 * @returns {number}  Duration in milliseconds.
 */
function sumDuration(steps) {
  if (!steps) return 0;
  const ns = steps.reduce((sum, s) => sum + ((s.result && s.result.duration) || 0), 0);
  return Math.round(ns / 1_000_000); // nanoseconds → milliseconds
}

/**
 * Parses a Cucumber JSON report and returns an array of CTEs.
 * Each scenario in each feature becomes one CTE.
 *
 * @param {Array|object} report   - Cucumber JSON report (array of feature objects).
 * @param {object}       context  - { orgId, teamId, buildId, environment }
 * @returns {Array}               - Array of Canonical Test Event objects.
 */
function parse(report, context) {
  const features = Array.isArray(report) ? report : [report];
  const ctes     = [];
  const now      = new Date().toISOString();

  for (const feature of features) {
    const suiteName = feature.name || feature.uri || 'Unnamed Feature';
    const elements  = Array.isArray(feature.elements) ? feature.elements : [];

    for (const scenario of elements) {
      // Skip Background sections — they are not independent test cases
      if (scenario.type === 'background') continue;

      const steps        = scenario.steps || [];
      const status       = resolveScenarioStatus(steps);
      const errorMessage = status === STATUSES.FAILED ? extractError(steps) : null;
      const durationMs   = sumDuration(steps);

      // Extract Gherkin tags (remove leading @)
      const tags = Array.isArray(scenario.tags)
        ? scenario.tags.map(t => (t.name || t).replace(/^@/, ''))
        : [];

      ctes.push(createCTE({
        orgId:        context.orgId,
        teamId:       context.teamId,
        testType:     TEST_TYPES.BDD,
        suiteName,
        testName:     scenario.name || 'Unnamed Scenario',
        status,
        durationMs,
        timestamp:    now,
        environment:  context.environment,
        buildId:      context.buildId,
        errorMessage,
        tags,
      }));
    }
  }

  return ctes;
}

module.exports = { parse };
