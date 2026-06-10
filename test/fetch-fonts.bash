#!/usr/bin/env bash

# DroidSansFallbackFull.ttf is committed to the repository; only download it
# if it is missing (e.g. a sparse checkout).
if [ -s ./resources/fonts/DroidSansFallbackFull.ttf ]; then
	echo "resources/fonts/DroidSansFallbackFull.ttf already present, skipping download."
	exit 0
fi

curl --location \
	--output ./resources/fonts/DroidSansFallbackFull.ttf \
	https://github.com/parlr/platform_frameworks_base/raw/562c45cc841681ed80d4e94515b23c28eb60eae4/data/fonts/DroidSansFallbackFull.ttf
