#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

node dist/picat.js < example.in | grep -Fx 'Total actions: 5'
output="$(node dist/picat.js <<'INPUT'
solve([[empty],[empty],[stack(stone,16)]],
      [[empty],[stack(stone,16)],[empty]]).
INPUT
)"
[[ "$output" == $'deposit(1,2,1)\nTotal actions: 1' ]]

output="$(node dist/picat.js <<'INPUT'
solve([[stack(stone,16),empty],[]],
      [[empty,stack(stone,16)],[]]).
INPUT
)"
[[ "$output" == 'No sorting plan' ]]

output="$(node dist/picat.js <<'INPUT'
solve([[stack(stone,16),empty],[empty]],
      [[empty,stack(stone,16)],[empty]]).
INPUT
)"
[[ "$output" == $'take(1,1,1)\ndeposit(1,1,2)\nTotal actions: 2' ]]

output="$(node dist/picat.js <<'INPUT'
solve([[stack(stone,16)],[empty]], [[stack(stone,16)],[empty]]).
INPUT
)"
[[ "$output" == 'Total actions: 0' ]]
