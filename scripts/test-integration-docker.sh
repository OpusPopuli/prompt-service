#!/usr/bin/env bash
# Integration test orchestration script
# Builds and runs integration tests in Docker containers
set -euo pipefail

COMPOSE_FILE="docker-compose-integration.yml"
PROJECT_NAME="prompt-integration"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

cleanup() {
  echo -e "\n${YELLOW}Cleaning up...${NC}"
  docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" down -v --remove-orphans 2>/dev/null || true
  return 0
}
trap cleanup EXIT

echo -e "${GREEN}=== Building integration test containers ===${NC}"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" build

echo -e "${GREEN}=== Starting services ===${NC}"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" up -d

echo -e "${YELLOW}Waiting for PostgreSQL...${NC}"
for i in $(seq 1 30); do
  if docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T prompt-db-test pg_isready -U postgres >/dev/null 2>&1; then
    echo -e "${GREEN}PostgreSQL is ready${NC}"
    break
  fi
  if [[ "$i" -eq 30 ]]; then
    echo -e "${RED}PostgreSQL failed to start${NC}"
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs prompt-db-test
    exit 1
  fi
  sleep 2
done

echo -e "${YELLOW}Waiting for opuspopuli-prompts health...${NC}"
for i in $(seq 1 60); do
  if docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" exec -T opuspopuli-prompts \
    node -e "require('http').get('http://localhost:3100/health', (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>{ const j=JSON.parse(d); process.exit(j.status==='ok' && j.activeTemplates>=12 ? 0 : 1) }) }).on('error', () => process.exit(1))" 2>/dev/null; then
    echo -e "${GREEN}Prompt service is healthy with seeded templates${NC}"
    break
  fi
  if [[ "$i" -eq 60 ]]; then
    echo -e "${RED}Prompt service failed to become healthy${NC}"
    docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs opuspopuli-prompts
    exit 1
  fi
  sleep 2
done

echo -e "${GREEN}=== Running integration tests ===${NC}"
docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" --profile test run --rm --build test-runner
TEST_EXIT=$?

if [[ $TEST_EXIT -eq 0 ]]; then
  echo -e "\n${GREEN}=== Integration tests passed ===${NC}"
else
  echo -e "\n${RED}=== Integration tests failed ===${NC}"
  docker compose -f "$COMPOSE_FILE" -p "$PROJECT_NAME" logs opuspopuli-prompts
fi

exit $TEST_EXIT
