# Inventory popup design prototype

Throwaway source on `prototype/inventory-popup`. Keep these variants and the switcher out of `main`. Rewrite the selected design as production code after the user chooses it.

Question: which inventory hierarchy works best in the existing compact popup? Three structurally different layouts share the same fictional fixture inventory and session constraints.

Run `mise run prototype` from this worktree, then open:

- `http://127.0.0.1:5188/entrypoints/popup/index.html?variant=A` for the scan-first list.
- `http://127.0.0.1:5188/entrypoints/popup/index.html?variant=B` for permission-first browsing.
- `http://127.0.0.1:5188/entrypoints/popup/index.html?variant=C` for the focused inspector.

The floating bottom bar and left/right arrow keys switch layouts. Arrow keys stay with text inputs, selects, and editable content. The selected variant stays in the URL. Search, filters, fixture scenarios, selected metadata, and simulated page results stay in memory.

The prototype uses no Firefox API, real extension inventory, remote assets, storage, telemetry, or live mutation. The development-only query branch mounts the prototype before loading the browser adapter. Production builds hide the switcher and omit the prototype route branch.

Decision status: awaiting the user's visual verdict. The implementation issue links this branch as the primary design source.
