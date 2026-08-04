export function requiresAiMainImageConfirmation(selection?: {
  variant?: string | null;
  confirmedAt?: Date | string | null;
} | null): boolean {
  return selection?.variant === "AI_DISPLAY_MAIN" && !selection.confirmedAt;
}
