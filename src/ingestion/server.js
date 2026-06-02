/**
 * QualityHub — Test Result Ingestion API
 * Author: Sandeepa Marpadga Venkata — Independent Researcher
 *
 * Accepts raw test reports from CI/CD pipelines, routes each request to the
 * appropriate format adapter, and publishes normalised Canonical Test Events
 * (CTEs) to the Kafka test-events topic.
 */

'use strict';

require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');
const { Kafka }   = require('kafkajs');
const winston     = require('winston');

const { TEST_TYPES }          = require('./cte-schema');
const playwrightAdapter       = require('../adapters/playwright-adapter');
const testcafeAdapter         = require('../adapters/testcafe-adapter');
const cucumberAdapter         = require('../adapters/cucumber-adapter');
const junitAdapter            = require('../adapters/junit-adapter');

// ── Logger ───────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console()],
});

// ── Kafka producer ───────────────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: 'qualityhub-ingestion',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
});
const producer = kafka.producer();
const TOPIC = process.env.KAFKA_TOPIC || 'test-events';

async function publishCTEs(ctes) {
  const messages = ctes.map(cte => ({
    key:   `${cte.orgId}:${cte.teamId}:${cte.testType}`,
    value: JSON.stringify(cte),
  }));
  await producer.send({ topic: TOPIC, messages });
  logger.info(`Published ${messages.length} CTEs to topic "${TOPIC}"`);
}

// ── Express app ──────────────────────────────────────────────────────────────
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ type: 'application/xml', limit: '50mb' }));

const limiter = rateLimit({ windowMs: 60_000, max: 500 });
app.use('/api/', limiter);

// ── Middleware: extract team context from headers ─────────────────────────
function extractContext(req, res, next) {
  req.orgId  = req.headers['x-org-id']  || process.env.DEFAULT_ORG_ID  || 'default-org';
  req.teamId = req.headers['x-team-id'] || 'unknown-team';
  req.buildId = req.headers['x-build-id'] || `build-${Date.now()}`;
  req.environment = req.headers['x-environment'] || 'dev';
  next();
}

// ── Health check ──────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ingestion-api' }));

// ── POST /api/ingest/playwright ────────────────────────────────────────────
app.post('/api/ingest/playwright', extractContext, async (req, res) => {
  try {
    const ctes = playwrightAdapter.parse(req.body, {
      orgId: req.orgId, teamId: req.teamId,
      buildId: req.buildId, environment: req.environment,
    });
    await publishCTEs(ctes);
    res.json({ accepted: ctes.length, testType: TEST_TYPES.E2E_PLAYWRIGHT });
  } catch (err) {
    logger.error('Playwright ingestion error', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/ingest/testcafe ──────────────────────────────────────────────
app.post('/api/ingest/testcafe', extractContext, async (req, res) => {
  try {
    const ctes = testcafeAdapter.parse(req.body, {
      orgId: req.orgId, teamId: req.teamId,
      buildId: req.buildId, environment: req.environment,
    });
    await publishCTEs(ctes);
    res.json({ accepted: ctes.length, testType: TEST_TYPES.E2E_TESTCAFE });
  } catch (err) {
    logger.error('TestCafe ingestion error', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/ingest/bdd ───────────────────────────────────────────────────
app.post('/api/ingest/bdd', extractContext, async (req, res) => {
  try {
    const ctes = cucumberAdapter.parse(req.body, {
      orgId: req.orgId, teamId: req.teamId,
      buildId: req.buildId, environment: req.environment,
    });
    await publishCTEs(ctes);
    res.json({ accepted: ctes.length, testType: TEST_TYPES.BDD });
  } catch (err) {
    logger.error('BDD ingestion error', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/ingest/junit ─────────────────────────────────────────────────
// testType can be overridden via ?testType=SMOKE or ?testType=INTEGRATION
app.post('/api/ingest/junit', extractContext, async (req, res) => {
  try {
    const testType = req.query.testType || TEST_TYPES.UNIT;
    const ctes = await junitAdapter.parse(req.body, {
      orgId: req.orgId, teamId: req.teamId,
      buildId: req.buildId, environment: req.environment, testType,
    });
    await publishCTEs(ctes);
    res.json({ accepted: ctes.length, testType });
  } catch (err) {
    logger.error('JUnit ingestion error', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// ── POST /api/ingest/generic ───────────────────────────────────────────────
// Accepts an array of partial CTE-compatible JSON objects
app.post('/api/ingest/generic', extractContext, async (req, res) => {
  try {
    const { createCTE } = require('./cte-schema');
    const items = Array.isArray(req.body) ? req.body : [req.body];
    const ctes = items.map(item => createCTE({
      ...item,
      orgId:       req.orgId,
      teamId:      item.teamId  || req.teamId,
      buildId:     item.buildId || req.buildId,
      environment: item.environment || req.environment,
    }));
    await publishCTEs(ctes);
    res.json({ accepted: ctes.length });
  } catch (err) {
    logger.error('Generic ingestion error', { error: err.message });
    res.status(400).json({ error: err.message });
  }
});

// ── Start server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;

async function start() {
  await producer.connect();
  logger.info('Kafka producer connected');
  app.listen(PORT, () => logger.info(`Ingestion API listening on port ${PORT}`));
}

start().catch(err => {
  logger.error('Failed to start ingestion API', { error: err.message });
  process.exit(1);
});

module.exports = app; // exported for testing
