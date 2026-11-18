# Sort your first inventory

[Install the release files](../install/overview.md), then open a terminal in the
directory containing `picat.js`.

## Step 1 — Write the two layouts

Save this request as `example.in`.

```picat
solve(
    [[empty,empty],[stack(stone,64)],[empty]],
    [[empty,stack(stone,64)],[empty],[empty]]
).
```

The first two rows are chests. The third row is the player inventory, which has
one empty slot. The desired layout puts the stone in slot 2 of Chest 1.

## Step 2 — Run the planner

```bash
node picat.js < example.in
```

```text
take(2,1,1)
deposit(1,1,2)
Total actions: 2
```

The first move takes Chest 2, slot 1 into player slot 1. The second move
deposits player slot 1 into Chest 1, slot 2.

## Step 3 — Change the destination

Change the first row of the desired layout to `[stack(stone,64),empty]`.
Run the same command again. The deposit changes to `deposit(1,1,1)` and
the move count stays at two.
