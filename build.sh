#!/bin/sh
set -eu

rm -rf dist
mkdir -p dist
cp server.js dist/
cp -R public dist/public
cp run.sh dist/run.sh
chmod 755 dist/run.sh
