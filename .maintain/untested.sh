#!/bin/bash

################################################################################
# untested.sh                                                                  #
#                                                                              #
# Determines which functions in a given contract lack (explicitly-named) test  #
# files.                                                                       #
#                                                                              #
################################################################################

FUNCTIONS_OUTFILE=/tmp/functions.tmp
TESTS_OUTFILE=/tmp/tests.tmp

# usage
if [ "$#" -ne 1 ]; then
    echo "[untested] usage: untested contract_name"
    exit
fi

# name of the contract
CONTRACT=$1

FUNCTIONS=$(grep function contracts/implementation/"$CONTRACT".sol | grep -v "\*" | grep -v "\/\/" | cut -d' ' -f6 | cut -d'(' -f1 | sort)
TESTS=$($(command -v ls) -1 test/AutoClaim | cut -d'.' -f1 | sort)

echo "$FUNCTIONS" > $FUNCTIONS_OUTFILE
echo "$TESTS" > $TESTS_OUTFILE

diff --unchanged-line-format= --old-line-format= --new-line-format='%L' $TESTS_OUTFILE $FUNCTIONS_OUTFILE
