#!/bin/bash

################################################################################
# lines.sh                                                                     #
#                                                                              #
# Reports various line count statistics for the codebase.                      #
################################################################################

IMPL_PATH="contracts/implementation"
INTERFACE_PATH="contracts/interfaces"
TESTS_PATH="test"

INTERFACE_LINES=$(find "$INTERFACE_PATH" -name "*.sol" -print0 | xargs wc -l | tail -n 1 | cut -d' ' -f3)
IMPL_LINES=$(find "$IMPL_PATH" -name "*.sol" -print0 | xargs wc -l | tail -n 1 | cut -d' ' -f3)

CODE_LINES=$(("$INTERFACE_LINES"+"$IMPL_LINES"))
TEST_LINES=$(find "$TESTS_PATH" -name "*.spec.ts" -print0 | xargs wc -l | tail -n 1 | cut -d' ' -f2)

TOTAL_LINES=$(("$CODE_LINES"+"$TEST_LINES"))

echo "CODE  $CODE_LINES"
echo "TESTS $TEST_LINES"
echo "TOTAL $TOTAL_LINES"

