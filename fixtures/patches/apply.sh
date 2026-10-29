#!/usr/bin/env bash
# Our copy of Primer: fixes Seamline's agent made on top of the published packages (see README, "Agent fixes on our copy").
set -euo pipefail
cd "$(dirname "$0")/.."
# InlineMessage docs list 'unvailable' (typo); code and Figma say 'unavailable'
sed -i "s/'unvailable'/'unavailable'/" primer-react/package/generated/components.json
