You are Agent 1 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: createUser, getUserById, getUserByEmail, updateUser, deleteUser, listUsers, recordUserLogin

Your task: Add input validation to all user management functions. Specifically:
- createUser: validate email format (must contain @), name must be non-empty, role must be valid
- updateUser: validate patch fields before applying
- getUserById / getUserByEmail: return undefined gracefully, no throws
- deleteUser: check user has no active orders before deleting (scan orders map if needed)
- listUsers: add optional limit parameter

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
