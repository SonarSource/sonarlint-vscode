#!/bin/bash

set -euo pipefail

echo " "
echo " >>>>> SonarLint console"
echo " "
find its/userdir -name '*SonarLint.log' -exec cat {} \;
echo " "
echo " >>>>> Extension host log"
echo " "
find its/userdir -name 'exthost.log' -exec cat {} \;
