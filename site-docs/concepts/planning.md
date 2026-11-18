# How the planner searches

A state is the complete layout of the chests and player inventory. A move changes
two slots. Taking a stack moves it from a chest to the player. Depositing a
stack moves it from the player to a chest. The destination must be empty, and a
move preserves the item's type and count.

The goal compares every slot with the desired layout, including empty slots.
The final layout already tells the planner where each stack belongs. During
the search, any empty chest slot can receive a stack, so a chest can serve as
temporary storage even if it ends up empty.

Picat searches the layouts reachable by those moves. Each move costs one, so
minimizing cost minimizes the number of actions. Search can grow quickly as you
add stacks or slots because each new placement can create more reachable layouts.
Some valid pairs of layouts are unreachable. For example, with no player slots,
a stack in a chest cannot move even when the desired chest slot is empty.
