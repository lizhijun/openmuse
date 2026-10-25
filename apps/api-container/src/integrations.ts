export interface IntegrationEnvironment {
  BROWSER_WORKER_URL?: string;
  WORKER_TOKEN?: string;
  BROWSER_PROVIDER?: string;
  BROWSER_ACCESS_ROLE?: string;
  BROWSER_ACCESS_KEY?: string;
  BROWSER_ACCESS_ISSUER_URL?: string;
  BROWSER_ACCESS_GRANT?: string;
  RUNTIME_DEPLOYMENT_ID?: string;
  RUNTIME_OWNER_ID?: string;
  RUNTIME_ADMIN_KEY?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

/** Optional integrations stay disabled until both sides of their credentials exist. */
export function integrationVariables(env: IntegrationEnvironment) {
  const browserUrl = env.BROWSER_WORKER_URL ?? "";
  const workerToken = env.WORKER_TOKEN ?? "";
  const provider = env.BROWSER_PROVIDER ?? "node";
  if (provider !== "node" && provider !== "cloudflare") throw new Error("Invalid browser provider");
  if (provider === "cloudflare" && !browserUrl)
    throw new Error("Cloudflare browser configuration is incomplete");
  const role = env.BROWSER_ACCESS_ROLE ?? "disabled",
    grant = env.BROWSER_ACCESS_GRANT ?? "",
    key = env.BROWSER_ACCESS_KEY ?? "",
    issuer = env.BROWSER_ACCESS_ISSUER_URL ?? "";
  if (!["disabled", "hub", "runtime"].includes(role))
    throw new Error("Invalid browser access role");
  if (role === "disabled" && (grant || key || issuer))
    throw new Error("Browser access requires an explicit role");
  const dedicated = Boolean(env.RUNTIME_DEPLOYMENT_ID && env.RUNTIME_DEPLOYMENT_ID !== "shared");
  if (dedicated && provider === "cloudflare" && browserUrl && role !== "runtime")
    throw new Error("Dedicated Cloudflare browser requires scoped access");
  if (role !== "disabled" && (provider !== "cloudflare" || !browserUrl))
    throw new Error("Scoped access requires Cloudflare browser");
  if (role === "hub" && (dedicated || grant || issuer || !/^[A-Za-z0-9+/]{43}=$/.test(key)))
    throw new Error("Invalid browser access hub credentials");
  if (role === "runtime") {
    if (
      !dedicated ||
      !env.RUNTIME_OWNER_ID ||
      key ||
      workerToken ||
      env.RUNTIME_ADMIN_KEY ||
      (Boolean(grant) && (!grant.startsWith("ba1.") || grant.length > 6000))
    )
      throw new Error("Runtime must use a single-account browser grant without shared keys");
    const url = new URL(issuer);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/"
    )
      throw new Error("Browser issuer requires HTTPS origin");
  }
  if (Boolean(browserUrl) !== Boolean(role === "runtime" ? issuer : workerToken))
    throw new Error("Browser configuration is incomplete");
  if (browserUrl) {
    const url = new URL(browserUrl);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      (role !== "runtime" && workerToken.length < 32)
    )
      throw new Error("Browser requires an HTTPS endpoint and a strong worker token");
  }
  const googleId = env.GOOGLE_CLIENT_ID ?? "";
  const googleSecret = env.GOOGLE_CLIENT_SECRET ?? "";
  if (Boolean(googleId) !== Boolean(googleSecret))
    throw new Error("Google configuration is incomplete");
  return {
    BROWSER_WORKER_URL: browserUrl.replace(/\/$/, ""),
    WORKER_TOKEN: workerToken,
    BROWSER_PROVIDER: provider,
    BROWSER_ACCESS_ROLE: role,
    BROWSER_ACCESS_KEY: key,
    BROWSER_ACCESS_ISSUER_URL: issuer,
    BROWSER_ACCESS_GRANT: grant,
    GOOGLE_CLIENT_ID: googleId,
    GOOGLE_CLIENT_SECRET: googleSecret,
  };
}
