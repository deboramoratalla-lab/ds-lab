#!/usr/bin/env bash
# Downloads Primer primitives (Figma variables export + CSS) into fixtures/package
set -euo pipefail
cd "$(dirname "$0")"
npm pack @primer/primitives@11.10.0 --silent
tar xzf primer-primitives-*.tgz && rm primer-primitives-*.tgz
npm pack @primer/css@22.3.2 --silent
mkdir -p primer-css && tar xzf primer-css-*.tgz -C primer-css && rm primer-css-*.tgz
