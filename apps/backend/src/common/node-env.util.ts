/** True only when NODE_ENV is exactly `development` (never staging/production/undefined). */
export function isDevelopmentNodeEnv(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "development";
}
