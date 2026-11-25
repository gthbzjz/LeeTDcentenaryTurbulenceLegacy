#!/bin/sh
set -eu

export NPM_CONFIG_REGISTRY='https://registry.npmjs.org/'
npm ci --registry='https://registry.npmjs.org/'
npm prune --omit=dev

rm -rf dist
mkdir -p dist
cp server.js dist/
cp pdf-report.js dist/
cp package.json package-lock.json dist/
cp -R public dist/public
cp -R node_modules dist/node_modules
cp run.sh dist/run.sh
chmod 755 dist/run.sh
