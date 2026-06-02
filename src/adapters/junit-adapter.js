/**
 * QualityHub — JUnit XML Adapter
 * Converts JUnit XML reports (Jest, JUnit 5, NUnit, PyTest, etc.)
 * into Canonical Test Events. The testType field can be overridden
 * to SMOKE or INTEGRATION via the context parameter.
 * Author: Sandeepa Marpadga Venkata — Independent Researcher
 */

'use strict';

const xml2js = require('xml2js');
const { createCTE, TEST_TYPES, STATUSES } = require('../ingestion/cte-schema');

const parser = new xml2js.Parser({ explicitArray: true, mergeAttrs: false });

/**
 * Parses an XML string into a JavaScript object.
 *
 * @param {string} xml
 * @returns {Promise<object>}
 */
async function parseXml(xml) {
  return parser.parseStringPromise(xml);
}

/**
 * Determines the CTE status for a JUnit <testcase> element.
 *
 * A testcase is FAILED  when it contains a <failure> or <error> child.
 * A testcase is SKIPPED when it contains a <skipped> child.
 * Otherwise it is PASSED.
 *
 * @param {object} testcase  - Parsed testcase object from xml2js.
 * @returns {string}
 */
function resolveStatus(testcase) {
  if (testcase.failure || testcase.error) return STATUSES.FAILED;
  if (testcase.skipped)                   return STATUSES.SKIPPED;
  return STATUSES.PASSED;
}

/**
 * Extracts an error message from the failure or error element.
 *
 * @param {object} testcase
 * @returns {string|null}
 */
function extractError(testcase) {
  const source = testcase.failure || testcase.error;
  if (!source || !Array.isArray(source) || source.length === 0) return null;

  const entry = source[0];
  const text  = typeof entry === 'string'
    ? entry
    : (entry._ || entry.$ && entry.$.message || JSON.stringify(entry));

  return text.length > 500 ? text.substring(0, 497) + '...' : text;
}

/**
 * Converts a JUnit time attribute (seconds, decimal) to milliseconds.
 *
 * @param {string|number} time
 * @returns {number}
 */
function toMs(time) {
  const seconds = parseFloat(time);
  return isNaN(seconds) ? 0 : Math.round(seconds * 1000);
}

/**
 * Processes a single <testsuite> element and appends CTEs to the array.
 *
 * @param {object}  suite    - Parsed testsuite object from xml2js.
 * @param {object}  context  - { orgId, teamId, buildId, environment, testType }
 * @param {Array}   ctes     - Output array to append to.
 * @param {string}  now      - ISO timestamp string.
 */
function processSuite(suite, context, ctes, now) {
  const attrs    = suite.$ || {};
  const suiteName = attrs.name || 'Unnamed Suite';
  const testcases = suite.testcase || [];

  for (const tc of testcases) {
    const tcAttrs  = tc.$ || {};
    const status   = resolveStatus(tc);
    const errMsg   = status === STATUSES.FAILED ? extractError(tc) : null;

    ctes.push(createCTE({
      orgId:        context.orgId,
      teamId:       context.teamId,
      testType:     context.testType || TEST_TYPES.UNIT,
      suiteName,
      testName:     tcAttrs.name || tcAttrs.classname || 'Unnamed Test',
      status,
      durationMs:   toMs(tcAttrs.time),
      timestamp:    now,
      environment:  context.environment,
      buildId:      context.buildId,
      errorMessage: errMsg,
      tags:         [],
    }));
  }
}

/**
 * Parses a JUnit XML string (single or multi-suite) and returns CTEs.
 *
 * @param {string}  xml      - Raw XML content.
 * @param {object}  context  - { orgId, teamId, buildId, environment, testType }
 * @returns {Promise<Array>} - Array of Canonical Test Event objects.
 */
async function parse(xml, context) {
  if (typeof xml !== 'string' || xml.trim() === '') {
    throw new Error('JUnit adapter expects a non-empty XML string.');
  }

  const doc  = await parseXml(xml);
  const ctes = [];
  const now  = new Date().toISOString();

  // Handle <testsuites> wrapper (multiple suites) or bare <testsuite>
  if (doc.testsuites && Array.isArray(doc.testsuites.testsuite)) {
    for (const suite of doc.testsuites.testsuite) {
      processSuite(suite, context, ctes, now);
    }
  } else if (doc.testsuite) {
    const suite = Array.isArray(doc.testsuite) ? doc.testsuite[0] : doc.testsuite;
    processSuite(suite, context, ctes, now);
  } else {
    throw new Error('JUnit XML must contain a <testsuite> or <testsuites> root element.');
  }

  return ctes;
}

module.exports = { parse };
