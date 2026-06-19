#!/bin/bash
# build Live2D viewer + deploy ไป live2d-viewer/ (fix absolute asset path)
SDK="/home/cj/program/sensor-ai/live2d-sdk/CubismSdkForWeb-5-r.5/Samples/TypeScript/Demo"
DEST="/home/cj/program/sensor-ai/live2d-viewer"
distrobox-enter ubuntu -- bash -c "cd '$SDK' && npm run build" || exit 1
rm -rf "$DEST"/*
cp -r "$SDK/dist/." "$DEST/"
sed -i 's|src="/assets/|src="./assets/|g' "$DEST/index.html"
echo "deployed → $DEST"
