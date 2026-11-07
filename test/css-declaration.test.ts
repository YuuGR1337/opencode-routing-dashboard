import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const TSC = path.join(process.cwd(), "node_modules/.bin/tsc");

function runTsc(dir: string) {
  const proc = Bun.spawnSync({
    cmd: [TSC, "--noEmit", "-p", "tsconfig.json"],
    cwd: dir,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = new TextDecoder().decode(proc.stdout) + new TextDecoder().decode(proc.stderr);
  return { exit: proc.exitCode, output };
}

test("TS7 exact CSS asset declaration: known styles.css resolves, missing .css errors (no wildcard)", () => {
  // Synthetic fixture validates exact approach (d file + allowArbitrary) via compiler
  // Known resolves only with matching styles.d.css.ts (export {}), missing stays TS2882

  // Case 1: known CSS resolves with exact declaration
  const goodDir = mkdtempSync(path.join(tmpdir(), "css-good-"));
  try {
    const tsconfig = {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noUncheckedIndexedAccess: true,
        skipLibCheck: true,
        noEmit: true,
        allowArbitraryExtensions: true,
      },
      include: ["."],
    };
    writeFileSync(path.join(goodDir, "tsconfig.json"), JSON.stringify(tsconfig));
    writeFileSync(path.join(goodDir, "styles.css"), "body { color: red; }");
    writeFileSync(path.join(goodDir, "styles.d.css.ts"), "export {};");
    writeFileSync(path.join(goodDir, "good.ts"), 'import "./styles.css";');
    const res = runTsc(goodDir);
    expect(res.exit).toBe(0);
    expect(res.output).not.toContain("TS2882");
    expect(res.output).not.toContain("styles.css");
  } finally {
    rmSync(goodDir, { recursive: true, force: true });
  }

  // Case 2: missing CSS stays error (even with d for other css present)
  const badDir = mkdtempSync(path.join(tmpdir(), "css-bad-"));
  try {
    const tsconfig = {
      compilerOptions: {
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        strict: true,
        noUncheckedIndexedAccess: true,
        skipLibCheck: true,
        noEmit: true,
        allowArbitraryExtensions: true,
      },
      include: ["."],
    };
    writeFileSync(path.join(badDir, "tsconfig.json"), JSON.stringify(tsconfig));
    writeFileSync(path.join(badDir, "styles.css"), "body {}");
    writeFileSync(path.join(badDir, "styles.d.css.ts"), "export {};");
    writeFileSync(path.join(badDir, "bad.ts"), 'import "./missing.css";');
    const res = runTsc(badDir);
    expect(res.exit).not.toBe(0);
    expect(res.output).toContain("TS2882");
    expect(res.output).toContain("missing.css");
    // ensure not accepting via wildcard
    expect(res.output).not.toMatch(
      /Cannot find module or type declarations for side-effect import of '\.\/styles\.css'/,
    );
  } finally {
    rmSync(badDir, { recursive: true, force: true });
  }

  // Project's real known CSS (styles.css) must resolve cleanly (uses web/styles.d.css.ts)
  const projRes = Bun.spawnSync({
    cmd: [TSC, "--noEmit"],
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });
  const projOut = new TextDecoder().decode(projRes.stdout) + new TextDecoder().decode(projRes.stderr);
  expect(projRes.exitCode).toBe(0);
  expect(projOut).not.toContain("TS2882");
  expect(projOut).not.toContain("styles.css");
});
