#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."

sw_vers
swift --version
swift test --package-path apps/macos "$@" --filter ApplicationsOwnership
for trial in 2 3 4 5; do
  echo "ApplicationsOwnership run $trial"
  swift test --package-path apps/macos "$@" --skip-build --filter ApplicationsOwnership
done
swift test --package-path apps/macos "$@" --skip-build
