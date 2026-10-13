export type RunStatus = 'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled' | 'timed_out' | 'interrupted';
export interface Event {
  id: number; runId: string; conversationId: string; sequence: number;
  type: 'run.queued' | 'run.started' | 'text.delta' | 'text.final' | 'tool.requested' | 'tool.result' | 'interaction.requested' | 'interaction.answered' | 'interaction.expired' | 'usage' | 'run.cancelling' | 'run.completed' | 'run.failed' | 'run.cancelled' | 'run.timed_out' | 'run.interrupted';
  payload: Record<string, unknown>; createdAt: string;
}
export interface Turn {
  runId: string; conversationId: string; sessionId: string | null; workspace: string;
  input: string; agent: { name: string; instructions: string }; model?: string;
}
export interface Handlers {
  signal: AbortSignal;
  onSession(id: string): void;
  onEvent(type: string, payload: Record<string, unknown>): void;
  onInteraction(payload: Record<string, unknown>): Promise<Record<string, unknown>[]>;
  onToolCall(payload: {call_id: string; name: string; arguments: Record<string, unknown>}): Promise<unknown>;
}
export interface Runtime {
  inspectCapabilities(): Promise<Record<string, unknown>>;
  startTurn(turn: Turn, handlers: Handlers): Promise<{status: RunStatus; output: string; usage: Record<string, unknown>; error?: {code: string}} >;
  cancelRun(runId: string): void;
  answerInteraction(runId: string, interactionId: string, answers: Record<string, unknown>[]): void;
  reopenSession(sessionId: string): Promise<Record<string, unknown>>;
}
