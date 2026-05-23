You are Agent 4 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: initiatePayment, confirmPayment, failPayment, refundPayment, getPaymentsByOrder, selectGateway

Your task: Harden the payment processing functions. Specifically:
- initiatePayment: check no existing pending/completed payment exists for the order before creating a new one
- confirmPayment: validate gatewayRef is non-empty string
- failPayment: add optional reason: string parameter stored on the payment (extend Payment type if needed, but only add optional fields)
- refundPayment: add partial refund support — optional amount parameter; if omitted refund full amount
- getPaymentsByOrder: add optional status filter
- selectGateway: make it exported (remove the leading function keyword and add export), add a fallback gateway "manual" for unknown methods

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
