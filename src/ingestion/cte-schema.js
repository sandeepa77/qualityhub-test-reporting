/**
 * QualityHub — Canonical Test Event (CTE) Schema
 * Author: Sandeepa Marpadga Venkata — Independent Researcher
 *
 * Every test result ingested by QualityHub — regardless of the originating
 * framework — is normalised to this schema before entering the analytics pipeline.
 */

const { v4: uuidv4 } = require('uuid');

// ── Allowed enum values ──────────────────────────────────────────────────────

const TEST_TYPES = Object.freeze({
  UNIT:           'UNIT',
  BDD:            'BDD',
  SMOKE:          'SMOKE',
  INTEGRATION:    'INTEGRATION',
  E2E_PLAYWRIGHT: 'E2E_PLAYWRIGHT',
  E2E_TESTCAFE:   'E2E_TESTCAFE',
});

const STATUSES = Object.freeze({
  PASSED:  'PASSED',
  FAILED:  'FAILED',
  SKIPPED: 'SKIPPED',
  PENDING: 'PENDING',
});

const ENVIRONMENTS = Object.freeze({
  DEV:     'dev',
  STAGING: 'staging',
  PROD:    'prod',
});

// ── JSON Schema (Draft 7) definition ────────────────────────────────────────

const CTE_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'https://qualityhub.dev/schemas/canonical-test-event.json',
  title: 'CanonicalTestEvent',
  type: 'object',
  required: [
    'eventId', 'orgId', 'teamId', 'testType',
    'suiteName', 'testName', 'status',
    'durationMs', 'timestamp', 'environment', 'buildId',
  ],
  properties: {
    eventId: {
      type: 'string',
      format: 'uuid',
      description: 'Unique identifier assigned to this individual test event.',
    },
    orgId: {
      type: 'string',
      minLength: 1,
      description: 'Namespace identifying the organisation (e.g. acme-corp).',
    },
    teamId: {
      type: 'string',
      minLength: 1,
      description: 'Identifier for the team that owns this test (e.g. payments-team).',
    },
    testType: {
      type: 'string',
      enum: Object.values(TEST_TYPES),
      description: 'Test category: UNIT | BDD | SMOKE | INTEGRATION | E2E_PLAYWRIGHT | E2E_TESTCAFE.',
    },
    suiteName: {
      type: 'string',
      minLength: 1,
      description: 'Name of the test suite or feature file containing this test.',
    },
    testName: {
      type: 'string',
      minLength: 1,
      description: 'Descriptive name of the individual test case.',
    },
    status: {
      type: 'string',
      enum: Object.values(STATUSES),
      description: 'Outcome: PASSED | FAILED | SKIPPED | PENDING.',
    },
    durationMs: {
      type: 'integer',
      minimum: 0,
      description: 'Wall-clock execution time in milliseconds.',
    },
    timestamp: {
      type: 'string',
      format: 'date-time',
      description: 'UTC ISO 8601 date-time at which the test completed.',
    },
    environment: {
      type: 'string',
      enum: Object.values(ENVIRONMENTS),
      description: 'Target environment at the time of execution: dev | staging | prod.',
    },
    buildId: {
      type: 'string',
      minLength: 1,
      description: 'Identifier of the CI/CD build or pipeline run.',
    },
    errorMessage: {
      type: ['string', 'null'],
      description: 'Failure message or abbreviated stack trace — present only when status is FAILED.',
    },
    tags: {
      type: 'array',
      items: { type: 'string' },
      description: 'Optional labels for filtering, e.g. regression, critical, nightly.',
      default: [],
    },
    extensions: {
      type: 'object',
      description: 'Tool-specific metadata that does not affect metric calculations (e.g. screenshot paths).',
      default: {},
    },
  },
  additionalProperties: false,
};

// ── Factory: create a new CTE with defaults applied ─────────────────────────

/**
 * Creates a validated Canonical Test Event object.
 * Assigns a new eventId automatically if one is not provided.
 *
 * @param {object} data  - Fields conforming to CTE_SCHEMA.
 * @returns {object}     - Complete CTE object.
 */
function createCTE(data) {
  return {
    eventId:      data.eventId      || uuidv4(),
    orgId:        data.orgId,
    teamId:       data.teamId,
    testType:     data.testType,
    suiteName:    data.suiteName,
    testName:     data.testName,
    status:       data.status,
    durationMs:   data.durationMs   ?? 0,
    timestamp:    data.timestamp    || new Date().toISOString(),
    environment:  data.environment  || ENVIRONMENTS.DEV,
    buildId:      data.buildId,
    errorMessage: data.errorMessage || null,
    tags:         data.tags         || [],
    extensions:   data.extensions   || {},
  };
}

// ── Utility: check whether a CTE counts as executed ─────────────────────────

/**
 * Returns true when a CTE status should be included in the pass/fail
 * percentage denominator (i.e. the test was actually executed).
 * SKIPPED and PENDING are excluded by default.
 *
 * @param {string} status
 * @param {boolean} [includeSkipped=false]
 * @returns {boolean}
 */
function isExecuted(status, includeSkipped = false) {
  if (includeSkipped) return true;
  return status === STATUSES.PASSED || status === STATUSES.FAILED;
}

module.exports = {
  TEST_TYPES,
  STATUSES,
  ENVIRONMENTS,
  CTE_SCHEMA,
  createCTE,
  isExecuted,
};
