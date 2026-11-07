import { afterEach, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const SCRIPT_PATH = path.resolve(process.cwd(), ".github/workflows/verify-release-ref.sh");

const SAFE_GIT_ENV = {
  GIT_AUTHOR_NAME: "fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

function exec(cmd: string, cwd: string, env: Record<string, string> = {}): string {
  return execSync(cmd, {
    cwd,
    env: { ...process.env, ...SAFE_GIT_ENV, ...env },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function runVerify(cwd: string, refName: string): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execSync(`bash "${SCRIPT_PATH}"`, {
      cwd,
      env: { ...process.env, ...SAFE_GIT_ENV, GITHUB_REF_NAME: refName },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string; message?: string };
    return {
      code: e.status ?? 1,
      stdout: e.stdout ?? "",
      stderr: e.stderr ?? (e.message || ""),
    };
  }
}

function rmTmp(tmp: string) {
  if (tmp && fs.existsSync(tmp)) {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

describe("release safeguard (bounded ancestry on main)", () => {
  let tmpDirs: string[] = [];

  afterEach(() => {
    tmpDirs.forEach(rmTmp);
    tmpDirs = [];
  });

  test("tagged main commit allowed", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "release-guard-main-tip-"));
    tmpDirs.push(tmp);

    const originDir = path.join(tmp, "origin.git");
    exec(`git init --bare "${originDir}"`, tmp);

    const workDir = path.join(tmp, "work");
    exec(`git clone "${originDir}" "${workDir}"`, tmp);
    exec(`git checkout -b main`, workDir);
    exec(`git commit --allow-empty -m "init"`, workDir);
    const mainTip = exec(`git rev-parse HEAD`, workDir);
    exec(`git push origin main`, workDir);

    // tag the main tip commit (lightweight for simplicity, also test annotated below)
    exec(`git tag v1.0.0 ${mainTip}`, workDir);
    exec(`git push origin v1.0.0`, workDir);

    // simulate CI checkout of the tag (detached at tag commit)
    const tagCheckout = path.join(tmp, "tag-checkout");
    exec(`git clone --branch v1.0.0 "${originDir}" "${tagCheckout}"`, tmp);

    const res = runVerify(tagCheckout, "v1.0.0");
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("within main ancestry");
    expect(res.stdout).toContain(mainTip);

    exec(`git remote set-url origin "${path.join(tmp, "missing-origin.git")}"`, tagCheckout);
    const unreachable = runVerify(tagCheckout, "v1.0.0");
    expect(unreachable.code).toBe(1);
    expect(unreachable.stdout + unreachable.stderr).toContain("failed to fetch");
  });

  test("older main ancestor allowed", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "release-guard-older-"));
    tmpDirs.push(tmp);

    const originDir = path.join(tmp, "origin.git");
    exec(`git init --bare "${originDir}"`, tmp);

    const workDir = path.join(tmp, "work");
    exec(`git clone "${originDir}" "${workDir}"`, tmp);
    exec(`git checkout -b main`, workDir);
    exec(`git commit --allow-empty -m "c0"`, workDir);
    const c0 = exec(`git rev-parse HEAD`, workDir);
    exec(`git commit --allow-empty -m "c1"`, workDir);
    exec(`git commit --allow-empty -m "c2"`, workDir);
    exec(`git push origin main`, workDir);

    // tag an older ancestor (c0)
    exec(`git tag -a v0.9.0 ${c0} -m "annotated old"`, workDir);
    exec(`git push origin v0.9.0`, workDir);

    // simulate checkout of the old tag
    const tagCheckout = path.join(tmp, "tag-checkout");
    exec(`git clone --branch v0.9.0 "${originDir}" "${tagCheckout}"`, tmp);

    const res = runVerify(tagCheckout, "v0.9.0");
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("within main ancestry");
    // confirm it resolved the annotated tag correctly to c0, not the tag object
    expect(res.stdout).toContain(c0);
    expect(res.stdout).not.toContain("tag object");
  });

  test("feature-only commit rejected", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "release-guard-feature-"));
    tmpDirs.push(tmp);

    const originDir = path.join(tmp, "origin.git");
    exec(`git init --bare "${originDir}"`, tmp);

    const workDir = path.join(tmp, "work");
    exec(`git clone "${originDir}" "${workDir}"`, tmp);
    exec(`git checkout -b main`, workDir);
    exec(`git commit --allow-empty -m "main only"`, workDir);
    exec(`git push origin main`, workDir);

    // create feature commit not on main
    exec(`git checkout -b feat`, workDir);
    exec(`git commit --allow-empty -m "feature only"`, workDir);
    const featCommit = exec(`git rev-parse HEAD`, workDir);
    exec(`git tag -a v1.1.0 ${featCommit} -m "annotated on feature"`, workDir);
    exec(`git push origin v1.1.0`, workDir);
    // note: do not push feat or merge to main

    const tagCheckout = path.join(tmp, "tag-checkout");
    exec(`git clone --branch v1.1.0 "${originDir}" "${tagCheckout}"`, tmp);

    const res = runVerify(tagCheckout, "v1.1.0");
    expect(res.code).toBe(1);
    expect(res.stdout + res.stderr).toContain("not reachable from origin/main");
    expect(res.stdout + res.stderr).toContain(featCommit);
  });

  test("missing main rejected", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "release-guard-missing-main-"));
    tmpDirs.push(tmp);

    const originDir = path.join(tmp, "origin.git");
    exec(`git init --bare "${originDir}"`, tmp);

    const workDir = path.join(tmp, "work");
    exec(`git clone "${originDir}" "${workDir}"`, tmp);
    // no main branch at all; only initial commit on whatever default
    exec(`git commit --allow-empty -m "no-main"`, workDir);
    const someCommit = exec(`git rev-parse HEAD`, workDir);
    // create a tag but no main ref in origin
    exec(`git tag v2.0.0 ${someCommit}`, workDir);
    exec(`git push origin v2.0.0`, workDir);

    const tagCheckout = path.join(tmp, "tag-checkout");
    exec(`git clone --branch v2.0.0 "${originDir}" "${tagCheckout}"`, tmp);

    const res = runVerify(tagCheckout, "v2.0.0");
    expect(res.code).toBe(1);
    expect((res.stdout + res.stderr).toLowerCase()).toContain("main");
    // fetch should have failed or ancestry fail
  });

  test("explicit invalid GITHUB_REF_NAME fails closed (regression)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "release-guard-invalid-ref-"));
    tmpDirs.push(tmp);

    const originDir = path.join(tmp, "origin.git");
    exec(`git init --bare "${originDir}"`, tmp);

    const workDir = path.join(tmp, "work");
    exec(`git clone "${originDir}" "${workDir}"`, tmp);
    exec(`git checkout -b main`, workDir);
    exec(`git commit --allow-empty -m "init"`, workDir);
    const mainTip = exec(`git rev-parse HEAD`, workDir);
    exec(`git push origin main`, workDir);

    exec(`git tag v1.2.3 ${mainTip}`, workDir);
    exec(`git push origin v1.2.3`, workDir);

    const tagCheckout = path.join(tmp, "tag-checkout");
    exec(`git clone --branch v1.2.3 "${originDir}" "${tagCheckout}"`, tmp);

    // explicit invalid set must fail closed (no fallback to HEAD)
    const res = runVerify(tagCheckout, "v999.999.999-INVALID");
    expect(res.code).not.toBe(0);
    expect(res.stdout).not.toContain(mainTip);
    expect((res.stdout + res.stderr).toLowerCase()).toContain("fatal");
  });

  test("workflow requests fetch-depth:0 and invokes guard before publish", () => {
    const ymlPath = path.resolve(process.cwd(), ".github/workflows/release.yml");
    const yml = fs.readFileSync(ymlPath, "utf8");
    expect(yml).toContain("fetch-depth: 0");
    const guardPos = yml.indexOf("Verify release ref is reachable from origin/main");
    const publishPos = yml.indexOf("Publish release");
    expect(guardPos).toBeGreaterThan(-1);
    expect(publishPos).toBeGreaterThan(guardPos);
  });
});
