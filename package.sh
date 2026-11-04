#!/bin/sh
# Builds tidystack.zip with only the files the extension needs, ready to upload to the Chrome Web Store.
# Leaves out legacy-v1/, react-vite-version-unused/, .vite/ and everything else that isn't part of the extension.
set -e
cd "$(dirname "$0")"
rm -f tidystack.zip
zip -r tidystack.zip \
  manifest.json background.js popup.html popup.css world.css popup.js themes.js pixel.js critter.js \
  icons fonts PRIVACY.md \
  -x "*.DS_Store"
echo "Built $(pwd)/tidystack.zip"
