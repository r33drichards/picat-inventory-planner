# stdin and stdout

```bash
node picat.js < request.in
```

## Input

Supply one ground Picat term `solve(Start, Goal).` on stdin, including the
trailing period.

| Element | Format |
| --- | --- |
| Layout | A list of rows with one or more chests and the player row last. |
| Row | A list of slots. The corresponding rows in both layouts must have the same lengths. |
| Empty slot | `empty` |
| Occupied slot | `stack(Item, Count)` where `Item` is an atom and `Count` is a positive integer. |

The input layouts must contain the same multiset of whole stacks. Two stacks
of 16 stone cannot become a single stack of 32.

## Output

| Line | Meaning |
| --- | --- |
| `take(Chest, ChestSlot, PlayerSlot)` | Move a chest stack to the given player slot. |
| `deposit(PlayerSlot, Chest, ChestSlot)` | Move a player stack to the given chest slot. |
| `Total actions: N` | The plan is complete. An already-matching layout has zero actions. |
| `No sorting plan` | The input is valid and the desired layout is unreachable. |
| `Invalid input. Expected solve(Start, Goal).` | The parsed term failed input validation. |

Chest and slot indices start at 1. If several shortest plans exist, the planner
may return any one of them.
