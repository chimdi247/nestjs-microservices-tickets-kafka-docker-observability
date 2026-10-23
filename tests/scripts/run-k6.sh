#!/usr/bin/env bash
# Usage: ./tests/scripts/run-k6.sh <smoke|load|stress|spike|soak|breakpoint> [extra k6 args]
# Runs from the project root, relaxes gateway throttling, streams results to Mimir (Grafana: "EventFlow - k6 Load Test").
set -euo pipefail
cd "$(dirname "$0")/../.."

TEST="${1:?usage: run-k6.sh <smoke|load|stress|spike|soak|breakpoint> [k6 args]}"; shift || true
COMPOSE=(docker compose -f docker-compose.yaml -f tests/docker-compose.tests.yaml)

"${COMPOSE[@]}" up -d api-gateway          # recreates the gateway only if the throttle env changed
echo "waiting for the gateway to be healthy..."
until [ "$(docker inspect -f '{{.State.Health.Status}}' eventflowapp-api-gateway 2>/dev/null)" = "healthy" ]; do sleep 2; done

"${COMPOSE[@]}" run --rm k6 run \
  -o experimental-prometheus-rw \
  --tag "testid=${TEST}-$(date +%Y%m%d-%H%M%S)" \
  "$@" "/scripts/${TEST}.js"

echo
echo "Dashboard: http://localhost:3030/d/eventflow-k6"
echo "Restore production throttling with: docker compose up -d api-gateway"
