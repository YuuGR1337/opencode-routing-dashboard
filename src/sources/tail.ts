import { type FSWatcher, watch } from "node:fs";
import { type FileHandle, open, stat } from "node:fs/promises";
import { dirname } from "node:path";

export type TailOptions = {
  path: string;
  pollMs?: number;
  watch?: boolean;
  maxLineBytes?: number;
  onLine: (line: string) => void;
  onStatus?: (status: "ok" | "missing" | "error", detail?: string) => void;
  onMalformed?: () => void;
};

export async function startTail(options: TailOptions): Promise<{ stop(): Promise<void>; drain(): Promise<void> }> {
  const limit = Math.max(1, options.maxLineBytes ?? 1024 * 1024);
  let file: FileHandle | undefined;
  let identity: { dev: number; ino: number } | undefined;
  let offset = 0;
  let parts: Buffer[] = [];
  let size = 0;
  let discarding = false;
  let stopped = false;
  let watcher: FSWatcher | undefined;
  let lastStatus: string | undefined;
  let active: Promise<void> | undefined;
  let pending: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  const status = (value: "ok" | "missing" | "error", detail?: string) => {
    const key = `${value}:${detail ?? ""}`;
    if (!stopped && key !== lastStatus) {
      lastStatus = key;
      options.onStatus?.(value, detail);
    }
  };
  const reset = () => {
    parts = [];
    size = 0;
    discarding = false;
  };
  const consume = (chunk: Buffer) => {
    let start = 0;
    while (start < chunk.length && !stopped) {
      const newline = chunk.indexOf(10, start);
      const end = newline < 0 ? chunk.length : newline;
      const part = chunk.subarray(start, end);
      if (!discarding) {
        if (size + part.length > limit) {
          parts = [];
          size = 0;
          discarding = true;
          options.onMalformed?.();
        } else {
          if (part.length) parts.push(part);
          size += part.length;
        }
      }
      if (newline < 0) break;
      if (!discarding && !stopped) options.onLine(Buffer.concat(parts, size).toString("utf8"));
      reset();
      start = newline + 1;
    }
  };
  const readFile = async () => {
    if (!file) return;
    const boundary = (await file.stat()).size;
    const buffer = Buffer.allocUnsafe(64 * 1024);
    while (!stopped && offset < boundary) {
      const { bytesRead } = await file.read(buffer, 0, Math.min(buffer.length, boundary - offset), offset);
      if (!bytesRead || stopped) break;
      offset += bytesRead;
      // Keep retained fragments independent of the reusable read buffer.
      consume(Buffer.from(buffer.subarray(0, bytesRead)));
    }
  };
  const run = async () => {
    if (stopped) return;
    try {
      let current: Awaited<ReturnType<typeof stat>>;
      try {
        current = await stat(options.path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        if (file) {
          await readFile();
          await file.close();
          file = undefined;
          identity = undefined;
          offset = 0;
          reset();
        }
        status("missing");
        return;
      }
      if (file && identity && (identity.dev !== current.dev || identity.ino !== current.ino)) {
        await readFile();
        await file.close();
        file = undefined;
        identity = undefined;
        offset = 0;
        reset();
      }
      if (!file) {
        file = await open(options.path, "r");
        const opened = await file.stat();
        identity = { dev: opened.dev, ino: opened.ino };
        offset = 0;
      } else if (current.size < offset) {
        offset = 0;
        reset();
      }
      await readFile();
      status("ok");
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      status(err.code === "ENOENT" ? "missing" : "error", err.code === "ENOENT" ? undefined : String(error));
    }
  };
  const drain = (): Promise<void> => {
    if (stopped) return pending ?? active ?? Promise.resolve();
    if (active) {
      if (!pending) {
        pending = active.then(() => {
          pending = undefined;
          return drain();
        });
      }
      return pending;
    }
    active = run().finally(() => {
      active = undefined;
    });
    return active;
  };
  if (options.watch !== false) {
    try {
      watcher = watch(dirname(options.path), () => {
        void drain();
      });
      watcher.on("error", (error) => {
        status("error", String(error));
        watcher?.close();
        watcher = undefined;
      });
    } catch (error) {
      status("error", String(error));
    }
  }
  const timer = setInterval(
    () => {
      void drain();
    },
    Math.max(1, options.pollMs ?? 1000),
  );
  await drain();
  return {
    drain,
    stop() {
      if (!stopping) {
        stopped = true;
        clearInterval(timer);
        watcher?.close();
        stopping = (pending ?? active ?? Promise.resolve()).then(async () => {
          if (file) {
            await file.close();
            file = undefined;
          }
        });
      }
      return stopping;
    },
  };
}
