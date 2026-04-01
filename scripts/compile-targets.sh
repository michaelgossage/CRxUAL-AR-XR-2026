#!/bin/bash
# Compile image targets from source artwork photographs
# Requires: npx image-target-cli (from @nicolo-ribaudo/8thwall-image-target-cli or similar)
#
# Usage: npm run compile-targets
# Place artwork photos in public/targets/source/ named artwork-01.jpg, artwork-02.jpg, etc.

set -e

SOURCE_DIR="public/targets/source"
OUTPUT_DIR="public/targets/compiled"
OUTPUT_FILE="$OUTPUT_DIR/targets.imgtar"

if [ ! -d "$SOURCE_DIR" ]; then
  echo "Error: Source directory $SOURCE_DIR not found."
  echo "Place artwork photographs there (artwork-01.jpg, artwork-02.jpg, etc.)"
  exit 1
fi

# Collect all images
IMAGES=()
for img in "$SOURCE_DIR"/*.{jpg,jpeg,png}; do
  [ -f "$img" ] && IMAGES+=("$img")
done

if [ ${#IMAGES[@]} -eq 0 ]; then
  echo "Error: No images found in $SOURCE_DIR"
  exit 1
fi

echo "Found ${#IMAGES[@]} target images"
mkdir -p "$OUTPUT_DIR"

# Build input args
INPUT_ARGS=""
for img in "${IMAGES[@]}"; do
  INPUT_ARGS="$INPUT_ARGS --input $img"
done

echo "Compiling image targets..."
npx image-target-cli $INPUT_ARGS --output "$OUTPUT_FILE"

echo "Done! Output: $OUTPUT_FILE"
