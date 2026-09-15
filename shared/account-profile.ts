export const MIN_PASSWORD_LENGTH = 4;

/** Only service-generated photo paths may be exposed by the clients. */
export function isAvatarPath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\/api\/avatars\/[a-f0-9-]{36}\/[a-f0-9]{64}\.jpg$/.test(value)
  );
}
