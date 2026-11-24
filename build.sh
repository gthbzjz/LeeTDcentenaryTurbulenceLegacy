#!/bin/sh
set -eu

if [ -d dist/.data ]; then mv dist/.data .data.snapshot; fi
rm -rf dist
mkdir -p dist
cp server.js dist/
cp pdf-report.js dist/
cp -R public dist/public
cp run.sh dist/run.sh
chmod 755 dist/run.sh
if [ -d .data.snapshot ]; then mv .data.snapshot dist/.data; fi
