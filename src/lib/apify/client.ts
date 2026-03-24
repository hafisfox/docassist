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

export async function runActor<T>(
  actorId: string,
  input: Record<string, unknown>,
  options: { correlationId?: string; timeoutSecs?: number } = {},
): Promise<T[]> {
  const client = getApifyClient();

  const run = await client.actor(actorId).call(input, {
    ...(options.timeoutSecs && { timeout: options.timeoutSecs }),
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
