You are Agent 2 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: createProduct, getProductById, updateProduct, deleteProduct, listProductsByVendor, listProductsByCategory, getProductsByIds

Your task: Add rich input validation and business rules to product catalog functions. Specifically:
- createProduct: validate price > 0, stock >= 0, name non-empty, category non-empty
- updateProduct: reject price <= 0 or negative stock in patch
- deleteProduct: throw if product has active orders referencing it
- listProductsByVendor / listProductsByCategory: add optional sortBy parameter ("price" | "stock" | "name")
- getProductsByIds: filter out missing ids silently, return only found products

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
