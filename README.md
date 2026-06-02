# QualityHub — Unified Multi-Team Test Reporting Framework

> **Independent Research by Sandeepa Marpadga Venkata**
> Published in IJISAE (International Journal of Intelligent Systems and Applications in Engineering)

---

## Overview

QualityHub is a vendor-neutral, extensible test reporting framework that aggregates results from **six test categories** across multiple engineering teams into a single real-time dashboard with **pass/fail percentage analytics**.

| Test Category | Tools Supported | Report Format |
|---|---|---|
| Unit Tests | Jest, JUnit, NUnit, PyTest | JUnit XML, TAP, JSON |
| BDD / Acceptance | Cucumber, SpecFlow, Behave | Cucumber JSON, Allure JSON |
| Smoke Tests | Playwright, TestCafe, custom | JSON, JUnit XML |
| Integration Tests | REST-assured, Postman/Newman, K6 | JUnit XML, JSON |
| E2E — Playwright | Microsoft Playwright v1.x | Playwright JSON Reporter |
| E2E — TestCafe | TestCafe v3.x | TestCafe JSON, xUnit XML |

---

## Key Features

- **Unified Ingestion API** — single REST endpoint accepts all test report formats
- **Canonical Test Event (CTE) Schema** — normalised data model for all test types
- **Real-Time Pass/Fail Analytics** — live percentage updates via WebSocket
- **Multi-Dimensional Aggregation** — by test type, by team, and organisation-wide
- **Interactive Dashboard** — radial gauges, stacked bar charts, trend line charts
- **Threshold Alerting** — configurable fail % alerts to Slack, Jira, PagerDuty
- **BDD Scenario Explorer** — drill-down into Cucumber features and scenarios
- **Playwright Trace Viewer** — linked traces and screenshot gallery for failures
- **TestCafe Report View** — fixture/test hierarchy with screenshot attachments

---

## Architecture

```
CI/CD Pipelines
      │
      ▼
┌─────────────────────────────────────────────────┐
│              INGESTION PLANE                     │
│  REST API → Format Adapters → Canonical CTE      │
└────────────────────┬────────────────────────────┘
                     │ Apache Kafka (test-events topic)
┌────────────────────▼────────────────────────────┐
│              ANALYTICS PLANE                     │
│  Pass/Fail Aggregation Engine → Apache Druid     │
└────────────────────┬────────────────────────────┘
                     │ WebSocket / GraphQL
┌────────────────────▼────────────────────────────┐
│             PRESENTATION PLANE                   │
│  React Dashboard + GraphQL API                   │
│  Slack / Jira / PagerDuty Integrations           │
└─────────────────────────────────────────────────┘
```

---

## Pass/Fail Calculation

```
Pass Percentage (PP) = ( Passed Tests / Executed Tests ) × 100
Fail Percentage (FP) = ( Failed Tests / Executed Tests ) × 100

Executed Tests = Passed + Failed
(Skipped and Pending are excluded from the denominator by default)
```

Aggregated across three dimensions simultaneously:
- **Test-Type Dimension** — per category (Unit, BDD, Smoke, Integration, Playwright, TestCafe)
- **Team Dimension** — per engineering team
- **Organisation Dimension** — company-wide rollup

---

## Project Structure

```
qualityhub-test-reporting/
├── docs/
│   └── IJISAE_QualityHub_TestReporting.docx   ← Research paper
├── src/
│   ├── ingestion/          ← Test Result Ingestion API
│   ├── adapters/           ← Format-specific adapters (Playwright, TestCafe, etc.)
│   ├── analytics/          ← Pass/Fail Aggregation Engine (PFAE)
│   └── dashboard/          ← React dashboard application
├── scripts/                ← Setup and utility scripts
├── tests/                  ← Framework test suite
├── .github/
│   └── workflows/          ← CI/CD pipeline definitions
├── package.json
├── docker-compose.yml
└── README.md
```

---

## Quick Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- Apache Kafka (included via Docker Compose)

### Installation

```bash
# Clone the repository
git clone https://github.com/SandeepaMarpadgaVenkata/qualityhub-test-reporting.git
cd qualityhub-test-reporting

# Install dependencies
npm install

# Start infrastructure (Kafka + Druid)
docker-compose up -d

# Start the ingestion API
npm run start:ingestion

# Start the analytics engine
npm run start:analytics

# Start the dashboard
npm run start:dashboard
```

### Ingesting Test Results

**Playwright:**
```bash
# Add to your playwright.config.js
reporter: [['json', { outputFile: 'results.json' }]]

# Push results to QualityHub
curl -X POST http://localhost:3001/api/ingest/playwright \
  -H "Content-Type: application/json" \
  -H "X-Team-ID: your-team-id" \
  -d @results.json
```

**Cucumber/BDD:**
```bash
curl -X POST http://localhost:3001/api/ingest/bdd \
  -H "Content-Type: application/json" \
  -H "X-Team-ID: your-team-id" \
  -d @cucumber-report.json
```

**TestCafe:**
```bash
# Install the reporter plugin
npm install testcafe-reporter-qualityhub

# Add to your .testcaferc.json
{ "reporter": "qualityhub" }
```

**Unit Tests (JUnit XML):**
```bash
curl -X POST http://localhost:3001/api/ingest/junit \
  -H "X-Team-ID: your-team-id" \
  -H "X-Test-Type: UNIT" \
  -F "report=@test-results.xml"
```

**Smoke / Integration Tests:**
```bash
# Override test type via query parameter
curl -X POST "http://localhost:3001/api/ingest/junit?testType=SMOKE" \
  -H "X-Team-ID: your-team-id" \
  -F "report=@smoke-results.xml"
```

---

## Dashboard

Open `http://localhost:3000` after starting all services.

| Panel | Description |
|---|---|
| Organisation Overview | Company-wide PP/FP gauges and trend sparklines |
| Team Scorecard | Per-category PP/FP bar chart for a single team |
| Test Type Breakdown | Cross-team comparison for one test category |
| Build Details | Suite-level pass/fail table with error excerpts |
| Trend Analysis | PP/FP line chart with moving-average overlay |
| Alert Centre | Active threshold breaches and SLA violation log |
| BDD Scenario Explorer | Feature/scenario drill-down with tag filtering |
| Playwright Trace Viewer | Traces and screenshot gallery for failures |
| TestCafe Report View | Fixture/test hierarchy with screenshots |

---

## Research Paper

The full research paper is available in the `docs/` folder:

📄 [`docs/IJISAE_QualityHub_TestReporting.docx`](docs/IJISAE_QualityHub_TestReporting.docx)

**Title:** QualityHub: A Unified Multi-Team Test Reporting Framework Spanning BDD, Playwright, TestCafe, Unit, Smoke, and Integration Testing with Real-Time Pass/Fail Analytics

**Author:** Sandeepa Marpadga Venkata — Independent Researcher

**Journal:** IJISAE — International Journal of Intelligent Systems and Applications in Engineering (ISSN: 2147-6799)

---

## Sample Evaluation Results

Results from the simulated 3-month prototype trial across 4 engineering teams:

| Metric | Baseline | End of Trial | Change |
|---|---|---|---|
| Defect Escape Rate | 14.8% | 10.2% | ↓ 31% |
| Mean Time to Detect (min) | 53.6 | 30.1 | ↓ 44% |
| Cross-Team Visibility (1–5) | 2.1 | 3.5 | ↑ 65% |
| Dashboard Adoption Rate | — | 76% | — |
| Average Pass Rate | 76.8% | 85.3% | ↑ 8.5 pp |

---

## Roadmap

- [ ] AI-powered failure classification (LLM-based root cause tagging)
- [ ] Predictive pass/fail model (gradient boosting on CTE history)
- [ ] Cross-organisation benchmarking (anonymised opt-in)
- [ ] VS Code extension (per-file test health in editor)
- [ ] Mobile test adapters (Appium, Detox, XCTest)

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

## Citation

If you use QualityHub or reference this research, please cite:

```
Sandeepa Marpadga Venkata, "QualityHub: A Unified Multi-Team Test Reporting Framework
Spanning BDD, Playwright, TestCafe, Unit, Smoke, and Integration Testing with
Real-Time Pass/Fail Analytics," IJISAE, ISSN: 2147-6799, 2025.
```
