/**
 * QualityHub — Pass/Fail Aggregation Engine (PFAE)
 * Consumes Canonical Test Events from Kafka and maintains rolling
 * pass/fail percentage counters at three aggregation dimensions:
 *   1. Test-Type Dimension  — per test category
 *   2. Team Dimension       — per engineering team
 *   3. Organisation Dimension — company-wide rollup
 *
 * Author: Sandeepa Marpadga Venkata — Independent Researcher
 */

'use strict';

require('dotenv').config();

const { Kafka }  = require('kafkajs');
const winston    = require('winston');
const { STATUSES, isExecuted } = require('../ingestion/cte-schema');

// ── Logger ───────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
});

// ── Kafka consumer ────────────────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: 'qualityhub-analytics',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});
const consumer = kafka.consumer({
  groupId: process.env.KAFKA_GROUP_ID || 'analytics-engine',
});
const TOPIC = process.env.KAFKA_TOPIC || 'test-events';

// ── In-memory metric store ────────────────────────────────────────────────────
// Structure: metrics[dimension][key] = { passed, failed, skipped, pending }
const metrics = {
  byTestType: {},   // key = testType string
  byTeam:     {},   // key = `${orgId}:${teamId}`
  byOrg:      {},   // key = orgId
};

/**
 * Returns or initialises a counter bucket.
 */
function getOrInit(store, key) {
  if (!store[key]) {
    store[key] = { passed: 0, failed: 0, skipped: 0, pending: 0, total: 0 };
  }
  return store[key];
}

/**
 * Increments the appropriate counter in a bucket.
 */
function increment(bucket, status) {
  bucket.total++;
  switch (status) {
    case STATUSES.PASSED:  bucket.passed++;  break;
    case STATUSES.FAILED:  bucket.failed++;  break;
    case STATUSES.SKIPPED: bucket.skipped++; break;
    case STATUSES.PENDING: bucket.pending++; break;
  }
}

/**
 * Calculates pass and fail percentages from a counter bucket.
 * Skipped and pending tests are excluded from the denominator by default.
 *
 * Pass%  = ( passed  / executed ) × 100
 * Fail%  = ( failed  / executed ) × 100
 * where executed = passed + failed
 *
 * @param {object}  bucket
 * @param {boolean} includeSkipped  - If true, skipped counts in denominator.
 * @returns {{ passPercent: number, failPercent: number, executed: number }}
 */
function calculatePercentages(bucket, includeSkipped = false) {
  const executed = includeSkipped
    ? bucket.total
    : bucket.passed + bucket.failed;

  if (executed === 0) {
    return { passPercent: 0, failPercent: 0, executed: 0 };
  }

  const passPercent = parseFloat(((bucket.passed / executed) * 100).toFixed(2));
  const failPercent = parseFloat(((bucket.failed / executed) * 100).toFixed(2));

  return { passPercent, failPercent, executed };
}

/**
 * Processes a single Canonical Test Event and updates all metric buckets.
 *
 * @param {object} cte  - A parsed CTE object.
 */
function processCTE(cte) {
  const { orgId, teamId, testType, status } = cte;

  increment(getOrInit(metrics.byTestType, testType),          status);
  increment(getOrInit(metrics.byTeam,     `${orgId}:${teamId}`), status);
  increment(getOrInit(metrics.byOrg,      orgId),             status);

  logger.debug('CTE processed', {
    orgId, teamId, testType, status,
    orgMetrics: calculatePercentages(metrics.byOrg[orgId]),
  });
}

/**
 * Returns a snapshot of all current aggregated metrics.
 *
 * @returns {object}
 */
function getMetricsSnapshot() {
  const snapshot = {
    byTestType: {},
    byTeam:     {},
    byOrg:      {},
    capturedAt: new Date().toISOString(),
  };

  for (const [key, bucket] of Object.entries(metrics.byTestType)) {
    snapshot.byTestType[key] = { ...bucket, ...calculatePercentages(bucket) };
  }
  for (const [key, bucket] of Object.entries(metrics.byTeam)) {
    snapshot.byTeam[key] = { ...bucket, ...calculatePercentages(bucket) };
  }
  for (const [key, bucket] of Object.entries(metrics.byOrg)) {
    snapshot.byOrg[key] = { ...bucket, ...calculatePercentages(bucket) };
  }

  return snapshot;
}

// ── Kafka consumer loop ───────────────────────────────────────────────────────
async function start() {
  await consumer.connect();
  logger.info('Analytics engine Kafka consumer connected');

  await consumer.subscribe({ topic: TOPIC, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const cte = JSON.parse(message.value.toString());
        processCTE(cte);
      } catch (err) {
        logger.error('Failed to process message', { error: err.message });
      }
    },
  });

  // Periodically log a metrics summary (every 30 seconds)
  setInterval(() => {
    logger.info('Metrics snapshot', getMetricsSnapshot());
  }, 30_000);
}

start().catch(err => {
  logger.error('Analytics engine failed to start', { error: err.message });
  process.exit(1);
});

module.exports = { processCTE, getMetricsSnapshot, calculatePercentages };
