You are Agent 7 working on demo/fixture/src/platform.ts via the SWAP coordination protocol.

Your assigned symbols: sendNotification, getNotifications, markNotificationRead, markAllNotificationsRead, deleteNotification

Your task: Add notification batching and delivery tracking. Specifically:
- sendNotification: add optional metadata?: Record<string, unknown> parameter; add it to the Notification type as optional field
- getNotifications: add optional type filter parameter (type?: Notification["type"]); sort results by createdAt descending
- markNotificationRead: return the notification after marking it read
- markAllNotificationsRead: return the count of notifications marked read
- deleteNotification: also accept deleting by userId (overload: deleteNotification(id: string) | deleteNotification(userId: string, all: true))
- Add a new exported function: getUnreadCount(userId: string): number

Follow the SWAP protocol exactly:
1. list_agents
2. broadcast_intent with your plan and file path
3. claim_symbol for EACH function before editing it
4. Edit the file
5. release_symbol for each claimed symbol with the full updated file as newSource
6. get_peer_context when done

Work through your symbols one at a time. Do not touch any functions outside your assigned list.
