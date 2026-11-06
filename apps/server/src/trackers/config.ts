import type { TrackerHttp } from "./http";
import {
  loadBakedTrackerConfig,
  type BakedTrackerConfig,
} from "./builtin-config";
import { AniListProvider } from "./providers/anilist";
import { MalProvider, DEFAULT_MAL_USER_AGENT } from "./providers/myanimelist";
import type { TrackerProvider, TrackerProviderId } from "./types";

export class TrackerConfigError extends Error {
  constructor(
    readonly provider: TrackerProviderId,
    message: string,
  ) {
    super(message);
    this.name = "TrackerConfigError";
  }
}

export interface TrackerEnvironment {
  anilistClientId?: string;
  anilistClientSecret?: string;
  anilistRedirectUri?: string;
  malClientId?: string;
  malClientSecret?: string;
  malRedirectUri?: string;
  malUserAgent?: string;
}

/**
 * Runtime environment variables win so self-hosters can override a packaged
 * build. Otherwise, credentials baked in at package time are used. A packaged
 * app therefore needs no environment variables at all.
 */
export function buildTrackerEnvironment(
  env: NodeJS.ProcessEnv,
  baked: BakedTrackerConfig = {},
): TrackerEnvironment {
  const configValue = (
    envKey: string,
    bakedValue: string | undefined,
  ): string | undefined => {
    const fromEnvironment = env[envKey]?.trim();
    if (fromEnvironment) return fromEnvironment;
    const fromBuild = bakedValue?.trim();
    return fromBuild ? fromBuild : undefined;
  };

  return {
    anilistClientId: configValue(
      "MUGIWARA_ANILIST_CLIENT_ID",
      baked.anilistClientId,
    ),
    anilistClientSecret: configValue(
      "MUGIWARA_ANILIST_CLIENT_SECRET",
      baked.anilistClientSecret,
    ),
    anilistRedirectUri: configValue(
      "MUGIWARA_ANILIST_REDIRECT_URI",
      baked.anilistRedirectUri,
    ),
    malClientId: configValue(
      "MUGIWARA_MAL_CLIENT_ID",
      baked.malClientId,
    ),
    malClientSecret: configValue(
      "MUGIWARA_MAL_CLIENT_SECRET",
      baked.malClientSecret,
    ),
    malRedirectUri: configValue(
      "MUGIWARA_MAL_REDIRECT_URI",
      baked.malRedirectUri,
    ),
    malUserAgent: configValue(
      "MUGIWARA_MAL_USER_AGENT",
      baked.malUserAgent,
    ),
  };
}

export function trackerEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): TrackerEnvironment {
  return buildTrackerEnvironment(env, loadBakedTrackerConfig());
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Redirect URIs must be reachable from the browser that completes OAuth. For
 * self-hosted/LAN installs set `server.publicUrl` (or the per-provider
 * `MUGIWARA_*_REDIRECT_URI` env vars) to the address other devices use.
 */
export function resolveRedirectUri(
  provider: TrackerProviderId,
  baseUrl: string,
  env: TrackerEnvironment = trackerEnvironment(),
): string {
  const override =
    provider === "anilist" ? env.anilistRedirectUri : env.malRedirectUri;
  if (override?.trim()) return override.trim();
  return `${normalizeBaseUrl(baseUrl)}/api/trackers/${provider}/auth/callback`;
}

export interface ProviderFactoryOptions {
  redirectUri: string;
  env?: TrackerEnvironment;
  http?: TrackerHttp;
  now?: () => number;
}

export function createTrackerProvider(
  provider: TrackerProviderId,
  options: ProviderFactoryOptions,
): TrackerProvider {
  const env = options.env ?? trackerEnvironment();
  if (provider === "anilist") {
    if (!env.anilistClientId) {
      throw new TrackerConfigError(
        provider,
        "AniList is not configured. Set MUGIWARA_ANILIST_CLIENT_ID on the server.",
      );
    }
    return new AniListProvider({
      clientId: env.anilistClientId,
      clientSecret: env.anilistClientSecret ?? null,
      redirectUri: options.redirectUri,
      http: options.http,
      now: options.now,
    });
  }

  if (!env.malClientId) {
    throw new TrackerConfigError(
      provider,
      "MyAnimeList is not configured. Set MUGIWARA_MAL_CLIENT_ID on the server.",
    );
  }
  return new MalProvider({
    clientId: env.malClientId,
    clientSecret: env.malClientSecret ?? null,
    redirectUri: options.redirectUri,
    userAgent: env.malUserAgent ?? DEFAULT_MAL_USER_AGENT,
    http: options.http,
    now: options.now,
  });
}

export function providerConfigured(
  provider: TrackerProviderId,
  env: TrackerEnvironment = trackerEnvironment(),
): boolean {
  return provider === "anilist" ? Boolean(env.anilistClientId) : Boolean(env.malClientId);
}

export const PROVIDER_LABELS: Record<TrackerProviderId, string> = {
  anilist: "AniList",
  myanimelist: "MyAnimeList",
};
