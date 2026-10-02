/** Probe tolerances, not permission to replay a game command. */
export const CONNECTION_POLICY = {
  heartbeatProbeMs: 5000,
  heartbeatSilenceMs: 15000,
  resumeProbeMs: 4000,
  resumeDeadlineMs: 12000,
  snapshotDeadlineMs: 12000,
  commandConfirmationMs: 8000,
} as const;
