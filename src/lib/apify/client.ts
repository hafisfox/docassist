import { ApifyClient } from "apify-client";
import { ApifyError } from "@/lib/errors";

function getConfig() {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) throw new Error("APIFY_API_TOKEN is not set");
  return { token };
}

let _instance: ApifyClient | null = null;

export function getApifyClient(): ApifyClient {
  if (!_instance) {
    const { token } = getConfig();
    _instance = new ApifyClient({ token });
  }
  return _instance;
}

/** Default ceiling so a hung Apify actor can't block a request indefinitely. */
const DEFAULT_TIMEOUT_SECS = 120;

export async function runActor<T>(
  actorId: string,
  input: Record<string, unknown>,
  options: { correlationId?: string; timeoutSecs?: number } = {},
): Promise<T[]> {
  const client = getApifyClient();

  const run = await client.actor(actorId).call(input, {
    timeout: options.timeoutSecs ?? DEFAULT_TIMEOUT_SECS,
  });

  if (!run || !run.defaultDatasetId) {
    throw new ApifyError("Apify actor run failed — no dataset returned", {
      correlationId: options.correlationId,
      context: { actorId },
    });
  }

  const { items } = await client.dataset(run.defaultDatasetId).listItems();
  return items as T[];
}
