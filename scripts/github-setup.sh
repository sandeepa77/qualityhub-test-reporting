#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# QualityHub — GitHub Setup Script
# Run this from inside the qualityhub-test-reporting/ folder
# ──────────────────────────────────────────────────────────────────────────────

set -e

echo "==> Initialising git repository..."
git init
git add .
git commit -m "Initial commit: QualityHub unified test reporting framework

- Canonical Test Event (CTE) schema and validator
- Ingestion API server (Express + Kafka)
- Adapters: Playwright, TestCafe, Cucumber/BDD, JUnit XML
- Pass/Fail Aggregation Engine (PFAE)
- Docker Compose infrastructure (Kafka, PostgreSQL, Redis)
- GitHub Actions CI workflow
- Unit test suite (Jest)
- IJISAE research paper (docs/)

Author: Sandeepa Marpadga Venkata — Independent Researcher"

echo ""
echo "==> Next steps:"
echo ""
echo "  1. Go to https://github.com/new"
echo "  2. Create a NEW repository named:  qualityhub-test-reporting"
echo "     - Owner: your GitHub username"
echo "     - Visibility: Public"
echo "     - Do NOT initialise with README, .gitignore or licence"
echo ""
echo "  3. Run these commands (replace YOUR_USERNAME with your GitHub username):"
echo ""
echo "     git remote add origin https://github.com/YOUR_USERNAME/qualityhub-test-reporting.git"
echo "     git branch -M main"
echo "     git push -u origin main"
echo ""
echo "Done! Your repo will be live at:"
echo "  https://github.com/YOUR_USERNAME/qualityhub-test-reporting"
