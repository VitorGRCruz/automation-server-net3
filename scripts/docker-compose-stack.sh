#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

read_env_file_value() {
  local key="$1"

  if [[ ! -f "${ENV_FILE}" ]]; then
    return 1
  fi

  local line
  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"

  if [[ -z "${line}" ]]; then
    return 1
  fi

  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line#\"}"
  line="${line%\"}"
  line="${line#\'}"
  line="${line%\'}"

  if [[ -z "${line}" ]]; then
    return 1
  fi

  printf '%s\n' "${line}"
}

resolve_project_node_env() {
  if [[ -n "${NODE_ENV:-}" ]]; then
    printf '%s\n' "${NODE_ENV}"
    return
  fi

  if read_env_file_value NODE_ENV >/dev/null 2>&1; then
    read_env_file_value NODE_ENV
    return
  fi

  printf '%s\n' development
}

resolve_temporal_mode_setting() {
  if [[ -n "${TEMPORAL_DOCKER_MODE:-}" ]]; then
    printf '%s\n' "${TEMPORAL_DOCKER_MODE}"
    return
  fi

  if read_env_file_value TEMPORAL_DOCKER_MODE >/dev/null 2>&1; then
    read_env_file_value TEMPORAL_DOCKER_MODE
    return
  fi

  printf '%s\n' auto
}

NODE_ENV_RESOLVED="$(resolve_project_node_env)"
TEMPORAL_DOCKER_MODE_RESOLVED="$(resolve_temporal_mode_setting)"

case "${TEMPORAL_DOCKER_MODE_RESOLVED}" in
  auto)
    if [[ "${NODE_ENV_RESOLVED}" == "production" ]]; then
      TEMPORAL_COMPOSE_MODE="production"
    else
      TEMPORAL_COMPOSE_MODE="development"
    fi
    ;;
  development | dev)
    TEMPORAL_COMPOSE_MODE="development"
    ;;
  production | prod)
    TEMPORAL_COMPOSE_MODE="production"
    ;;
  *)
    echo "Invalid TEMPORAL_DOCKER_MODE: ${TEMPORAL_DOCKER_MODE_RESOLVED}" >&2
    echo "Use one of: auto, development, production." >&2
    exit 1
    ;;
esac

COMPOSE_FILES=(
  -f "${PROJECT_ROOT}/docker-compose.yml"
)

if [[ "${TEMPORAL_COMPOSE_MODE}" == "development" ]]; then
  COMPOSE_FILES+=(-f "${PROJECT_ROOT}/docker-compose.temporal-dev.yml")
else
  COMPOSE_FILES+=(-f "${PROJECT_ROOT}/docker-compose.temporal-prod.yml")
fi

echo "Resolved Temporal Docker mode: ${TEMPORAL_COMPOSE_MODE} (NODE_ENV=${NODE_ENV_RESOLVED}, TEMPORAL_DOCKER_MODE=${TEMPORAL_DOCKER_MODE_RESOLVED})"

COMPOSE_ARGS=()
if [[ -f "${ENV_FILE}" ]]; then
  COMPOSE_ARGS+=(--env-file "${ENV_FILE}")
fi

exec docker compose "${COMPOSE_ARGS[@]}" "${COMPOSE_FILES[@]}" "$@"
