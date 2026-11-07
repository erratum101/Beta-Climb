#!/bin/sh
# Run after installing requirements and running fetch_assets.py.
set -eu
cd "$(dirname "$0")"
ratpoc_python="${RATPOC_PYTHON:-.venv/bin/python}"

for ratpoc_sample in p2a_orange p3_orange p4_green; do
    case "$ratpoc_sample" in
        p2a_orange) ratpoc_result=development ;;
        p3_orange) ratpoc_result=test-p3 ;;
        p4_green) ratpoc_result=test-p4 ;;
    esac
    "$ratpoc_python" prototype.py "assets/clips/$ratpoc_sample.mp4" --output "results/$ratpoc_result"
    "$ratpoc_python" evaluate.py "results/$ratpoc_result/result.json" --annotations "assets/annotations/$ratpoc_sample"
    "$ratpoc_python" render.py "results/$ratpoc_result/result.json"
done
