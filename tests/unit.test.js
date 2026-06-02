/**
 * QualityHub — Unit Tests
 * Author: Sandeepa Marpadga Venkata — Independent Researcher
 */

'use strict';

const playwrightAdapter  = require('../src/adapters/playwright-adapter');
const testcafeAdapter    = require('../src/adapters/testcafe-adapter');
const cucumberAdapter    = require('../src/adapters/cucumber-adapter');
const junitAdapter       = require('../src/adapters/junit-adapter');
const { calculatePercentages, processCTE, getMetricsSnapshot } = require('../src/analytics/engine');
const { STATUSES, TEST_TYPES, createCTE, isExecuted } = require('../src/ingestion/cte-schema');

const CTX = {
  orgId: 'test-org', teamId: 'test-team',
  buildId: 'build-001', environment: 'dev',
};

// ─────────────────────────────────────────────────────────────────────────────
// CTE Schema
// ─────────────────────────────────────────────────────────────────────────────
describe('CTE Schema', () => {
  test('createCTE assigns a UUID eventId when none provided', () => {
    const cte = createCTE({ ...CTX, testType: TEST_TYPES.UNIT, suiteName: 'S', testName: 'T', status: STATUSES.PASSED, buildId: 'b1' });
    expect(cte.eventId).toMatch(/^[0-9a-f-]{36}$/);
  });

  test('createCTE preserves an explicit eventId', () => {
    const id  = 'custom-id-123';
    const cte = createCTE({ eventId: id, ...CTX, testType: TEST_TYPES.UNIT, suiteName: 'S', testName: 'T', status: STATUSES.PASSED, buildId: 'b1' });
    expect(cte.eventId).toBe(id);
  });

  test('isExecuted returns true for PASSED', ()  => expect(isExecuted(STATUSES.PASSED)).toBe(true));
  test('isExecuted returns true for FAILED',  ()  => expect(isExecuted(STATUSES.FAILED)).toBe(true));
  test('isExecuted returns false for SKIPPED', () => expect(isExecuted(STATUSES.SKIPPED)).toBe(false));
  test('isExecuted returns false for PENDING', () => expect(isExecuted(STATUSES.PENDING)).toBe(false));
  test('isExecuted includes skipped when flag set', () => expect(isExecuted(STATUSES.SKIPPED, true)).toBe(true));
});

// ─────────────────────────────────────────────────────────────────────────────
// Playwright Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe('Playwright Adapter', () => {
  const REPORT = {
    suites: [{
      title: 'Auth Suite',
      suites: [],
      specs: [{
        title: 'Login with valid credentials',
        tests: [{ results: [{ status: 'passed', duration: 1200 }] }],
      }, {
        title: 'Login with invalid credentials should fail',
        tests: [{ results: [{ status: 'failed', duration: 800, errors: [{ message: 'Expected 200, got 401' }] }] }],
      }, {
        title: 'Forgot password flow',
        tests: [{ results: [{ status: 'skipped', duration: 0 }] }],
      }],
    }],
  };

  test('produces one CTE per test', () => {
    const ctes = playwrightAdapter.parse(REPORT, CTX);
    expect(ctes).toHaveLength(3);
  });

  test('sets testType to E2E_PLAYWRIGHT', () => {
    const ctes = playwrightAdapter.parse(REPORT, CTX);
    ctes.forEach(c => expect(c.testType).toBe(TEST_TYPES.E2E_PLAYWRIGHT));
  });

  test('maps passing test to PASSED', () => {
    const ctes = playwrightAdapter.parse(REPORT, CTX);
    expect(ctes[0].status).toBe(STATUSES.PASSED);
  });

  test('maps failing test to FAILED and captures error', () => {
    const ctes = playwrightAdapter.parse(REPORT, CTX);
    expect(ctes[1].status).toBe(STATUSES.FAILED);
    expect(ctes[1].errorMessage).toContain('Expected 200, got 401');
  });

  test('maps skipped test to SKIPPED', () => {
    const ctes = playwrightAdapter.parse(REPORT, CTX);
    expect(ctes[2].status).toBe(STATUSES.SKIPPED);
  });

  test('sums duration across retry attempts', () => {
    const retryReport = {
      suites: [{ title: 'Retry Suite', suites: [], specs: [{
        title: 'Flaky test',
        tests: [{ results: [
          { status: 'failed', duration: 500 },
          { status: 'passed', duration: 600 },
        ]}],
      }]}],
    };
    const ctes = playwrightAdapter.parse(retryReport, CTX);
    expect(ctes[0].durationMs).toBe(1100);
    expect(ctes[0].status).toBe(STATUSES.PASSED); // final attempt passed
  });

  test('throws on invalid input', () => {
    expect(() => playwrightAdapter.parse(null, CTX)).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TestCafe Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe('TestCafe Adapter', () => {
  const REPORT = {
    fixtures: [{
      name: 'Checkout Fixture',
      tests: [
        { name: 'Add item to cart',       errs: [],                     skipped: false, durationMs: 950 },
        { name: 'Apply invalid coupon',   errs: ['Coupon code invalid'], skipped: false, durationMs: 400 },
        { name: 'Guest checkout (skip)',  errs: [],                     skipped: true,  durationMs: 0   },
      ],
    }],
  };

  test('produces one CTE per test', () => {
    const ctes = testcafeAdapter.parse(REPORT, CTX);
    expect(ctes).toHaveLength(3);
  });

  test('sets testType to E2E_TESTCAFE', () => {
    testcafeAdapter.parse(REPORT, CTX).forEach(c => expect(c.testType).toBe(TEST_TYPES.E2E_TESTCAFE));
  });

  test('uses fixture name as suiteName', () => {
    const ctes = testcafeAdapter.parse(REPORT, CTX);
    ctes.forEach(c => expect(c.suiteName).toBe('Checkout Fixture'));
  });

  test('marks test with errs as FAILED', () => {
    const ctes = testcafeAdapter.parse(REPORT, CTX);
    expect(ctes[1].status).toBe(STATUSES.FAILED);
    expect(ctes[1].errorMessage).toBe('Coupon code invalid');
  });

  test('marks skipped test as SKIPPED', () => {
    const ctes = testcafeAdapter.parse(REPORT, CTX);
    expect(ctes[2].status).toBe(STATUSES.SKIPPED);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Cucumber Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe('Cucumber BDD Adapter', () => {
  const REPORT = [
    {
      name: 'User Registration',
      uri:  'features/registration.feature',
      elements: [
        {
          type: 'scenario', name: 'Successful registration',
          tags: [{ name: '@regression' }],
          steps: [
            { result: { status: 'passed', duration: 200_000_000 } },
            { result: { status: 'passed', duration: 150_000_000 } },
          ],
        },
        {
          type: 'scenario', name: 'Duplicate email registration',
          tags: [],
          steps: [
            { result: { status: 'passed',  duration: 100_000_000 } },
            { result: { status: 'failed',  duration: 80_000_000, error_message: 'Expected error toast, found none' } },
          ],
        },
        {
          type: 'background', name: 'Background setup',
          steps: [{ result: { status: 'passed', duration: 50_000_000 } }],
        },
      ],
    },
  ];

  test('ignores background elements', () => {
    const ctes = cucumberAdapter.parse(REPORT, CTX);
    expect(ctes).toHaveLength(2);
  });

  test('sets testType to BDD', () => {
    cucumberAdapter.parse(REPORT, CTX).forEach(c => expect(c.testType).toBe(TEST_TYPES.BDD));
  });

  test('uses feature name as suiteName', () => {
    cucumberAdapter.parse(REPORT, CTX).forEach(c => expect(c.suiteName).toBe('User Registration'));
  });

  test('marks all-passed scenario as PASSED', () => {
    const ctes = cucumberAdapter.parse(REPORT, CTX);
    expect(ctes[0].status).toBe(STATUSES.PASSED);
  });

  test('marks scenario with failing step as FAILED', () => {
    const ctes = cucumberAdapter.parse(REPORT, CTX);
    expect(ctes[1].status).toBe(STATUSES.FAILED);
    expect(ctes[1].errorMessage).toContain('Expected error toast');
  });

  test('strips @ from Gherkin tags', () => {
    const ctes = cucumberAdapter.parse(REPORT, CTX);
    expect(ctes[0].tags).toContain('regression');
  });

  test('converts nanosecond duration to milliseconds', () => {
    const ctes = cucumberAdapter.parse(REPORT, CTX);
    expect(ctes[0].durationMs).toBe(350); // 350_000_000 ns = 350 ms
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// JUnit Adapter
// ─────────────────────────────────────────────────────────────────────────────
describe('JUnit XML Adapter', () => {
  const VALID_XML = `<?xml version="1.0" encoding="UTF-8"?>
<testsuite name="PaymentServiceTests" tests="3" failures="1" time="2.5">
  <testcase name="processPayment_success" classname="PaymentServiceTest" time="0.8"/>
  <testcase name="processPayment_insufficientFunds" classname="PaymentServiceTest" time="0.9">
    <failure message="Expected DECLINED, got APPROVED">
      AssertionError: Expected DECLINED, got APPROVED
        at PaymentServiceTest.java:45
    </failure>
  </testcase>
  <testcase name="processPayment_networkTimeout" classname="PaymentServiceTest" time="0.8">
    <skipped/>
  </testcase>
</testsuite>`;

  test('parses a valid JUnit XML report', async () => {
    const ctes = await junitAdapter.parse(VALID_XML, { ...CTX, testType: TEST_TYPES.UNIT });
    expect(ctes).toHaveLength(3);
  });

  test('maps passing testcase to PASSED', async () => {
    const ctes = await junitAdapter.parse(VALID_XML, { ...CTX, testType: TEST_TYPES.UNIT });
    expect(ctes[0].status).toBe(STATUSES.PASSED);
  });

  test('maps testcase with <failure> to FAILED', async () => {
    const ctes = await junitAdapter.parse(VALID_XML, { ...CTX, testType: TEST_TYPES.UNIT });
    expect(ctes[1].status).toBe(STATUSES.FAILED);
    expect(ctes[1].errorMessage).toContain('Expected DECLINED');
  });

  test('maps testcase with <skipped> to SKIPPED', async () => {
    const ctes = await junitAdapter.parse(VALID_XML, { ...CTX, testType: TEST_TYPES.UNIT });
    expect(ctes[2].status).toBe(STATUSES.SKIPPED);
  });

  test('honours testType override for SMOKE', async () => {
    const ctes = await junitAdapter.parse(VALID_XML, { ...CTX, testType: TEST_TYPES.SMOKE });
    ctes.forEach(c => expect(c.testType).toBe(TEST_TYPES.SMOKE));
  });

  test('converts time attribute to milliseconds', async () => {
    const ctes = await junitAdapter.parse(VALID_XML, { ...CTX, testType: TEST_TYPES.UNIT });
    expect(ctes[0].durationMs).toBe(800);
  });

  test('throws on empty input', async () => {
    await expect(junitAdapter.parse('', CTX)).rejects.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Pass/Fail Aggregation Engine
// ─────────────────────────────────────────────────────────────────────────────
describe('Pass/Fail Aggregation Engine — calculatePercentages', () => {
  test('returns 100% pass for all-passed bucket', () => {
    const bucket = { passed: 10, failed: 0, skipped: 0, pending: 0, total: 10 };
    const { passPercent, failPercent, executed } = calculatePercentages(bucket);
    expect(passPercent).toBe(100);
    expect(failPercent).toBe(0);
    expect(executed).toBe(10);
  });

  test('returns 0% pass for all-failed bucket', () => {
    const bucket = { passed: 0, failed: 5, skipped: 0, pending: 0, total: 5 };
    const { passPercent, failPercent } = calculatePercentages(bucket);
    expect(passPercent).toBe(0);
    expect(failPercent).toBe(100);
  });

  test('calculates mixed pass/fail correctly', () => {
    const bucket = { passed: 80, failed: 20, skipped: 5, pending: 0, total: 105 };
    const { passPercent, failPercent, executed } = calculatePercentages(bucket);
    expect(passPercent).toBe(80);
    expect(failPercent).toBe(20);
    expect(executed).toBe(100); // skipped excluded
  });

  test('returns 0 for empty bucket', () => {
    const bucket = { passed: 0, failed: 0, skipped: 0, pending: 0, total: 0 };
    const { passPercent, failPercent, executed } = calculatePercentages(bucket);
    expect(passPercent).toBe(0);
    expect(failPercent).toBe(0);
    expect(executed).toBe(0);
  });

  test('includes skipped in denominator when flag is set', () => {
    const bucket = { passed: 80, failed: 10, skipped: 10, pending: 0, total: 100 };
    const { executed } = calculatePercentages(bucket, true);
    expect(executed).toBe(100);
  });
});
