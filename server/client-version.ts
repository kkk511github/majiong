/** Admission policy, not a security attestation of an untrusted client binary. */
const numericVersion = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
export function clientVersionPolicy(minimum?: string) {
  const required = minimum?.trim();
  if (required && !numericVersion.test(required)) throw new Error('MIN_CLIENT_VERSION 必须是 x.y.z 格式');
  return {
    minimum: required || undefined,
    accepts(version: unknown) {
      if (!required) return true;
      if (typeof version !== 'string' || !numericVersion.test(version)) return false;
      const actual = version.split('.').map(Number), target = required.split('.').map(Number);
      for (let i = 0; i < 3; i++) if (actual[i] !== target[i]) return actual[i] > target[i];
      return true;
    },
  };
}
