export function getEnv(name: string, fallback?: string): string {
  const v = process.env[name]
  if (v) return v
  if (fallback !== undefined) return fallback
  throw new Error(`Missing required environment variable: ${name}`)
}
