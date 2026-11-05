import { createTrackerProvider, resolveRedirectUri } from "./config";
import { createProviderRateGate } from "./gate";
import { TrackerSyncQueue } from "./queue";
import { TrackerService } from "./service";
import { TrackerConfigError } from "./config";
import type { TrackerProvider, TrackerProviderId } from "./types";

export { TrackerService } from "./service";
export { TrackerSyncQueue } from "./queue";
export { TrackerConfigError } from "./config";
export type {
  MangaTrackingLink,
  MangaTrackingOverview,
  SyncResult,
  TrackerAccountSummary,
  TrackerConflict,
} from "./service";

export interface TrackerRuntimeOptions {
  baseUrl: string;
  now?: () => number;
}

export interface TrackerRuntime {
  service: TrackerService;
  queue: TrackerSyncQueue;
}

export function createTrackerRuntime(
  options: TrackerRuntimeOptions,
): TrackerRuntime {
  const getProvider = (
    provider: TrackerProviderId,
    redirectUri?: string,
  ): TrackerProvider =>
    createTrackerProvider(provider, {
      redirectUri:
        redirectUri ?? resolveRedirectUri(provider, options.baseUrl),
      now: options.now,
    });

  const service = new TrackerService({
    getProvider,
    getBaseUrl: () => options.baseUrl,
    now: options.now,
    rateGate: createProviderRateGate({ now: options.now }),
  });

  const queue = new TrackerSyncQueue({
    now: options.now,
    handler: async (job) => {
      if (job.mangaId) {
        await service.syncOne(job.mangaId, job.provider, job.direction);
      }
    },
  });
  service.setLocalChangeHandler((mangaId, provider) =>
    queue.schedulePush(mangaId, provider),
  );

  return { service, queue };
}

export function isTrackerConfigError(
  error: unknown,
): error is TrackerConfigError {
  return error instanceof TrackerConfigError;
}
