You are Agent 10 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: searchProducts, trackEvent, getTopProducts, getRevenueByPeriod, getUserEngagementStats, flushAnalytics

Your task: Improve search relevance and analytics richness. Specifically:
- searchProducts: add price range filter (minPrice?: number, maxPrice?: number); add tag filter (tags?: string[]); add inStockOnly?: boolean filter; sort results by relevance (exact name match first, then partial)
- trackEvent: batch events — if analyticsQueue exceeds 100 items, auto-flush (call flushAnalytics internally) before pushing
- getTopProducts: also accept a category filter parameter; exclude out-of-stock products by default (add includeOutOfStock?: boolean)
- getRevenueByPeriod: also return breakdown by payment method: { total: number; byMethod: Record<string, number> }
- getUserEngagementStats: add averageOrderValue to the return object
- flushAnalytics: add optional event type filter parameter so you can flush only specific event types
- Add a new exported function: getSearchSuggestions(prefix: string, limit?: number): string[] that returns matching product names

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
