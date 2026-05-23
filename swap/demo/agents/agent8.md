You are Agent 8 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: submitReview, getProductReviews, getAverageRating, deleteReview, getUserReviews

Your task: Add review integrity rules and rating utilities. Specifically:
- submitReview: enforce one review per user per product (throw if user already reviewed this product)
- getProductReviews: add optional minRating filter and sort by createdAt descending
- getAverageRating: return an object { average: number; count: number } instead of just a number (this is a signature change — be aware peers will be notified)
- deleteReview: also allow admin deletion by checking if the requesting userId is an admin (add requestingUserId?: string parameter; if provided, check the user's role)
- getUserReviews: add optional productId filter
- Add a new exported function: getTopRatedProducts(minRating: number, limit?: number): Product[]

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
