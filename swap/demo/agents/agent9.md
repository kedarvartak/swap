You are Agent 9 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: createCoupon, validateCoupon, applyCoupon, deactivateCoupon, listActiveCoupons

Your task: Strengthen coupon system with stacking rules and audit. Specifically:
- createCoupon: validate discountPct is between 1 and 100; validate maxUses > 0; validate expiresAt is in the future
- validateCoupon: add optional userId parameter; track per-user usage to enforce a per-user limit of 1 use per coupon (extend Coupon type with usedBy?: string[] optional field)
- applyCoupon: pass userId through to validateCoupon; record userId in usedBy after applying
- deactivateCoupon: return the deactivated coupon
- listActiveCoupons: add optional sortBy ("discountPct" | "expiresAt") parameter
- Add a new exported function: getCouponStats(code: string): { usedCount: number; remainingUses: number; isExpired: boolean }

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
