export type WSEvent =
  | { type: "agent:stdout"; agentId: string; data: string }
  | { type: "agent:stderr"; agentId: string; data: string }
  | { type: "agent:status"; agentId: string; status: string }
  | { type: "agent:exit"; agentId: string; code: number | null }
  | { type: "agent:turn_end"; agentId: string }
  | { type: "agent:renamed"; agentId: string; name: string }
  | { type: "todo:updated"; todoId: string }
  | { type: "integration:sync"; integrationId: string }
  | { type: "slack:summary"; channelId: string; summaryId: string }
  | { type: "slack:unread"; unreadCount: number }
  | { type: "ping" };

export type WSCommand =
  | { type: "agent:stdin"; agentId: string; data: string }
  | { type: "agent:start"; agentId: string }
  | { type: "agent:stop"; agentId: string }
  | { type: "agent:resize"; agentId: string; cols: number; rows: number }
  | { type: "subscribe"; channel: string }
  | { type: "unsubscribe"; channel: string }
  | { type: "pong" };
