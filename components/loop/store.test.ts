import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadLoop, saveReleases } from "@/app/_data/loop-store";

type Call = { url: string; init: RequestInit };

function stubRest(rows: Record<string, unknown[]>): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const table = new URL(url).pathname.split("/").pop()!;
    const body = init.method && init.method !== "GET" ? "" : JSON.stringify(rows[table] ?? []);
    return new Response(body, { status: body ? 200 : 201 });
  });
  return calls;
}

describe("supabase loop store", () => {
  beforeEach(() => {
    vi.stubEnv("SUPABASE_URL", "https://demo.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_test");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("reads registry snapshots and release settings from Postgres", async () => {
    stubRest({
      registry_snapshots: [
        {
          nct_id: "NCT02496663",
          fetched_at: "2026-09-27T04:07:14.725Z",
          study: {
            nctId: "NCT02496663",
            overallStatus: "RECRUITING",
            lastUpdatePostDate: null,
            primaryCompletionDate: null,
            sites: [],
          },
        },
        { nct_id: "NCT00000000", fetched_at: "2026-09-27T04:07:14.725Z", study: { broken: true } },
      ],
      release_settings: [{ physician_id: "hcp-rahman", mode: "auto" }],
    });
    const state = await loadLoop();
    expect(state.backend).toBe("supabase");
    expect(state.registry.map((row) => row.study.overallStatus)).toEqual(["RECRUITING"]);
    expect(state.releases).toEqual([{ physicianId: "hcp-rahman", mode: "auto" }]);
  });

  it("upserts release settings and sends a secret key only as apikey", async () => {
    const calls = stubRest({});
    await saveReleases([{ physicianId: "hcp-rahman", mode: "review" }]);
    const post = calls.find((c) => c.url.endsWith("/rest/v1/release_settings"))!;
    const headers = post.init.headers as Record<string, string>;
    expect(headers.apikey).toBe("sb_secret_test");
    expect(headers.Authorization).toBeUndefined();
    expect(headers.Prefer).toContain("merge-duplicates");
    expect(JSON.parse(String(post.init.body))[0]).toMatchObject({ physician_id: "hcp-rahman", mode: "review" });
  });
});
