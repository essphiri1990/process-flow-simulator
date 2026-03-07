export const shouldRenderProcessFlowSessionPanel = (options: {
  isEmbedded: boolean;
  sdkContext: { launchMode?: string; supportsFacilitatorMode?: boolean } | null | undefined;
  currentSession: unknown;
}): boolean => {
  const { isEmbedded, sdkContext, currentSession } = options;
  if (!isEmbedded) return false;
  if (sdkContext?.supportsFacilitatorMode !== true) return false;
  const launchMode = sdkContext?.launchMode || 'solo';
  return Boolean(launchMode !== 'solo' || currentSession);
};
