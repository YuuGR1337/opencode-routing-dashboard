import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadAnalyticsSettings, notifyAlert } from "../src/sources/analytics";

describe("analytics IO", () => {
  test("loads explicit bounded settings, rejects invalid and credential-like files", async () => {
    const dir = await mkdtemp("/tmp/opencode/analytics-");
    try {
      const file = join(dir, "analytics.json");
      await writeFile(
        file,
        JSON.stringify({
          quotas: [{ id: "q", label: "Plan", provider: "p", metric: "tokens", limit5h: 100 }],
          alerts: { holdMs: 1, repeatMs: 2, activeMs: 3, desktop: false },
        }),
      );
      expect((await loadAnalyticsSettings(file)).quotas[0]?.limit5h).toBe(100);
      await writeFile(
        file,
        JSON.stringify({ quotas: [{ id: "q", label: "P", provider: "p", metric: "messages", limit5h: 0 }] }),
      );
      await expect(loadAnalyticsSettings(file)).rejects.toThrow();
      await writeFile(file, " ".repeat(256 * 1024 + 1));
      await expect(loadAnalyticsSettings(file)).rejects.toThrow();
      await expect(loadAnalyticsSettings(join(dir, "auth.json"))).rejects.toThrow();
      await writeFile(file, "{}");
      expect(await loadAnalyticsSettings(file)).toEqual({
        quotas: [],
        alerts: { holdMs: 0, repeatMs: 60000, activeMs: 60000, desktop: false },
      });
      const quota = { id: "same", label: "P", provider: "p", metric: "messages" };
      await writeFile(file, JSON.stringify({ quotas: [quota, quota] }));
      await expect(loadAnalyticsSettings(file)).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  test("notifications use arguments rather than shell or AppleScript interpolation", async () => {
    const calls: string[][] = [];
    const runner = async (args: string[]) => {
      calls.push(args);
      return 0;
    };
    const alert = { sourceId: 'evil"; do shell script "bad', kind: "fallback" as const, since: 1, lastFired: 2 };
    expect(await notifyAlert(alert, { platform: "darwin", runner })).toEqual({ ok: true });
    expect(calls[0]?.[0]).toBe("osascript");
    expect(calls[0]?.[2]).toContain("on run argv");
    expect(calls[0]?.[2]).not.toContain(alert.sourceId);
    expect(
      await notifyAlert(alert, {
        platform: "linux",
        runner: async () => {
          throw new Error("failure");
        },
      }),
    ).toEqual({ ok: false, reason: "notification failed" });
    let aborted = false;
    const stuck = async (_args: string[], signal: AbortSignal) =>
      new Promise<number>((resolve) =>
        signal.addEventListener("abort", () => {
          aborted = true;
          resolve(1);
        }),
      );
    expect(await notifyAlert(alert, { platform: "linux", runner: stuck, timeoutMs: 5 })).toEqual({
      ok: false,
      reason: "notification failed",
    });
    expect(aborted).toBe(true);
  });
});
