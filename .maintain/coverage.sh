#!/bin/bash

################################################################################
# coverage.sh                                                                  #
#                                                                              # 
# Extracts coverage report table from existing coverage tooling (i.e., via     #
# Yarn).                                                                       #
################################################################################

OUTFILE=/tmp/coverage.out.tmp
COVERAGE_CMD="yarn run coverage"
NEEDLE="\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-\-"

$COVERAGE_CMD > $OUTFILE 2> /dev/null

START_LINE=$(grep -rin "$NEEDLE" "$OUTFILE" | head -n 1 | cut -d':' -f1)
END_LINE=$(grep -rin "$NEEDLE" "$OUTFILE" | tail -n 1 | cut -d':' -f1)

REPORT_LINES=$(tail -n +"$START_LINE" "$OUTFILE" | head -n $(( "$END_LINE"-"$START_LINE"+1 )))

echo "$REPORT_LINES"

