export interface BillingEnvironment {
  MUSE_BILLING_ENABLED?: string;
  MUSE_BILLING_URL?: string;
  MUSE_BILLING_CLIENT_ID?: string;
  MUSE_BILLING_SECRET?: string;
  MODEL_PROXY_KEY?: string;
  PUBLIC_API_URL: string;
  RUNTIME_DEPLOYMENT_ID?: string;
}
/** A metered runtime never receives a provider/proxy key capable of bypassing its allowance. */
export function billingVariables(env: BillingEnvironment) {
  const enabled = env.MUSE_BILLING_ENABLED === "true";
  if (enabled) {
    const url = new URL(env.MUSE_BILLING_URL ?? "");
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/api/internal/muse/inference" ||
      url.search ||
      url.hash ||
      url.username ||
      url.password ||
      env.MUSE_BILLING_CLIENT_ID !== (env.RUNTIME_DEPLOYMENT_ID || "shared") ||
      !/^[A-Za-z0-9_-]{43,128}$/.test(env.MUSE_BILLING_SECRET ?? "")
    )
      throw new Error("Metered inference configuration is incomplete or unscoped");
  }
  return {
    MUSE_BILLING_ENABLED: enabled ? "true" : "false",
    MUSE_BILLING_URL: enabled ? (env.MUSE_BILLING_URL ?? "") : "",
    MUSE_BILLING_CLIENT_ID: enabled ? (env.MUSE_BILLING_CLIENT_ID ?? "") : "",
    MUSE_BILLING_SECRET: enabled ? (env.MUSE_BILLING_SECRET ?? "") : "",
    OPENAI_BASE_URL: enabled ? "" : `${env.PUBLIC_API_URL}/internal/ai/v1`,
    OPENAI_API_KEY: enabled ? "" : (env.MODEL_PROXY_KEY ?? ""),
  };
}
