export interface MessageHandler {
  reset(): void;
  handleToolStart(toolName: string, args: Record<string, unknown>): void;
  handleToolEnd(toolName: string, isError: boolean): void;
  handleSessionEvent(event: Record<string, unknown>): void;
}

export function createMessageHandler(): MessageHandler {
  return {
    reset() {},
    handleToolStart(toolName) {
      console.log(`Tool started: ${toolName}`);
    },
    handleToolEnd(toolName, isError) {
      console.log(`Tool finished: ${toolName}${isError ? " (error)" : ""}`);
    },
    handleSessionEvent() {},
  };
}
