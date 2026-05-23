#!/usr/bin/env bash
cd "$(dirname "$0")"
fuser -k 7700/tcp 2>/dev/null || true
node --loader ts-node/esm server/index.ts 2>&1 | grep -v ExperimentalWarning | grep -v DEP0180 | grep -v "trace-warnings" | grep -v "Use node"
