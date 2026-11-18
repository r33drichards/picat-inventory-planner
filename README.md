# Picat inventory planner

Find a shortest sequence of whole-stack moves from a starting inventory to an
exact target layout.

## Documentation

Start with the [documentation home](site-docs/index.md), or go directly to
[Install](site-docs/install/overview.md),
[Sort your first inventory](site-docs/tutorials/first-plan.md),
[Build and publish WebAssembly](site-docs/how-to/build-wasm.md),
[How the planner searches](site-docs/concepts/planning.md), or
[stdin and stdout](site-docs/reference/cli.md).

To preview the docs locally, install MkDocs 1.6.1 and run
`mkdocs build --strict` or `mkdocs serve`.

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
    [[stack(stone,64),empty,stack(stone,16)],[empty,stack(dirt,32)],[empty,empty]]
).
```

The two arguments are the initial layout and the exact desired layout.
The final row is the player inventory. Chest and slot indices start at 1.
Both layouts must have identical dimensions and contain the same whole
stacks. The desired layout specifies where every stack ends up, including
stacks that should stay in the player inventory.

`take(Chest,ChestSlot,PlayerSlot)` moves a chest stack into an empty player
slot. `deposit(PlayerSlot,Chest,ChestSlot)` moves a player stack into an
empty slot in any chest. This allows chests to serve as temporary storage
during search. Stacks cannot split or merge. Each move costs one.
The utility prints the plan and `Total actions: N`, or `No sorting plan`
when the desired layout is unreachable.

## Build

Activate Emscripten 4.0.21, then run `bash build-wasm.sh` followed by
`bash smoke-test.sh`. The build compiles the pinned [Picat fork][picat]
and embeds `inventory.pi` in the WebAssembly distribution. The JavaScript
provides the Node.js host and stdin support.

GitHub Actions builds and tests on pushes and pull requests. A version tag
such as `v0.1.0`, or a manual run on `main` with a new release tag, publishes
the tested binaries and Picat license as release assets.

[picat]: https://github.com/r33drichards/picat/tree/2d00e3a456c2f7736940e1a1ed66e7b0aef8e021
