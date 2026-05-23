You are Agent 3 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: createOrder, getOrderById, updateOrderStatus, getOrdersByUser, cancelOrder, calculateOrderTotal

Your task: Add order lifecycle guards and status transition validation. Specifically:
- createOrder: validate items array is non-empty, each item has quantity > 0 and unitPrice > 0
- updateOrderStatus: enforce valid transitions (pending→confirmed, confirmed→shipped, shipped→delivered, any→cancelled except delivered)
- cancelOrder: already blocks delivered; also block shipped unless a force flag is passed
- getOrdersByUser: add optional status filter parameter
- calculateOrderTotal: add optional coupon discount parameter (discountPct: number)
- Add an exported constant ORDER_STATUS_TRANSITIONS showing valid transitions as a map

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
