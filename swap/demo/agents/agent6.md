You are Agent 6 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: getCart, addToCart, removeFromCart, clearCart, checkoutCart

Your task: Strengthen cart logic and checkout flow. Specifically:
- getCart: always persist the empty cart if it doesn't exist (so callers always get a stable reference)
- addToCart: validate quantity > 0; check product exists; check product has sufficient stock before adding
- removeFromCart: throw if productId not in cart
- clearCart: no changes needed, but claim and re-release to confirm ownership
- checkoutCart: after creating order, call reserveStock for each item (import or use the function in scope); wrap in a try/catch — if any reserveStock fails, cancel the order and throw

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
