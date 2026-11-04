import { cp, mkdir } from "node:fs/promises";

const result = await Bun.build({
  entrypoints: ["./web/main.tsx"],
  outdir: "./dist",
  naming: "[name].[ext]",
  target: "browser",
});
if (!result.success) {
  for (const message of result.logs) console.error(message);
  process.exit(1);
}
await mkdir("dist", { recursive: true });
await cp("web/index.html", "dist/index.html");
try {
  await cp("web/assets", "dist/assets", { recursive: true });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
