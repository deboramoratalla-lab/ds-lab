#!/usr/bin/env bash
# Downloads Primer primitives (Figma variables export + CSS) into fixtures/package
set -euo pipefail
cd "$(dirname "$0")"
npm pack @primer/primitives@11.10.0 --silent
tar xzf primer-primitives-*.tgz && rm primer-primitives-*.tgz
