# Picat inventory planner

Find a shortest sequence of whole-stack moves from a starting inventory to an
exact target layout, within a caller-supplied action budget.

## Run the WebAssembly build

Download `picat.js` and `picat.wasm` from the same GitHub release, place them
in the same directory, and run with Node.js 22 or later.

```bash
node picat.js < example.in
```

Supply one Picat data term on stdin, ending in a period.

```picat
solve(
    [[empty,stack(dirt,32),empty],[stack(stone,64),empty],[stack(stone,16),empty]],
    [[stack(stone,64),empty,stack(stone,16)],[empty,stack(dirt,32)],[empty,empty]],
    [[stone,1],[dirt,2]],
    5
).
```

The arguments are the start layout, the exact goal layout, the home chest
for each item type, and the maximum number of actions. The final row is
the player inventory. Chest and slot indices start at 1. The two layouts
must have identical dimensions and contain the same whole stacks. Each
item type needs one home chest. Goal stacks in a chest must be in that
item's home. The goal may also specify stacks in the player row.

`take(Chest,ChestSlot,PlayerSlot)` moves a chest stack into an empty player
slot. `deposit(PlayerSlot,Chest,ChestSlot)` moves a player stack into an
empty slot in its configured home chest. Taking a stack already in its
home chest allows it to be rearranged within that chest. Stacks cannot
split or merge. Each move costs one. The utility prints the plan and
`Total actions: N`, or `No sorting plan within budget`.

## Build

Activate Emscripten 4.0.21, then run `bash build-wasm.sh` followed by
`bash smoke-test.sh`. The build compiles the pinned [Picat fork][picat]
and embeds `inventory.pi` in the WebAssembly distribution. The JavaScript
provides the Node.js host and stdin support.

GitHub Actions builds and tests on pushes and pull requests. A version tag
such as `v0.1.0`, or a manual run on `main` with a new release tag, publishes
the tested binaries and Picat license as release assets.

[picat]: https://github.com/r33drichards/picat/tree/2d00e3a456c2f7736940e1a1ed66e7b0aef8e021
