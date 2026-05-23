You are Agent 5 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: adjustInventory, reserveStock, restockProduct, getInventoryHistory, getLowStockProducts, bulkRestock

Your task: Add inventory integrity and audit improvements. Specifically:
- adjustInventory: add a maxStock cap of 10000; emit a console.warn if stock drops below 5 after adjustment
- reserveStock: check product exists before adjusting; throw with clear message if insufficient stock
- restockProduct: validate quantity > 0
- getInventoryHistory: add optional date range filter (start?: Date, end?: Date)
- getLowStockProducts: also return products with stock === 0 always, regardless of threshold
- bulkRestock: collect all errors and throw a single aggregated error if any fail (don't stop on first failure)

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
