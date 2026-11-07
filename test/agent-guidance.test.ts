import { expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

// Static structural contract for agent guidance artifacts.
// This test is invoked from the repository root by `bun test`.
const REPO_ROOT = process.cwd();
const SKILLS_DIR = join(REPO_ROOT, ".agents", "skills");

const EXPECTED_SKILLS = ["branch-and-pr", "tests-first", "release", "evidence-contract-review", "ui-verification"];

const EXPECTED_CASES: Record<string, string[]> = {
  "branch-and-pr": ["evaluation-only", "dirty-worktree"],
  "tests-first": ["parser-regression", "sse-view"],
  release: ["prepare-only", "first-release"],
  "evidence-contract-review": ["unsupported-execution", "source-collision"],
  "ui-verification": ["isolated-demo", "dataset-mismatch"],
};

const SOURCE_DOCS = [
  join(REPO_ROOT, "docs", "AGENT_WORKFLOWS.md"),
  join(REPO_ROOT, "docs", "AGENT_EVALUATION.md"),
  join(REPO_ROOT, "docs", "ROADMAP.md"),
  join(REPO_ROOT, "docs", "decisions", "README.md"),
  join(REPO_ROOT, "docs", "decisions", "0001-desktop-direction.md"),
];

const READ_ONLY_TOOLS = new Set(["Read", "Glob", "Grep", "Skill"]);

async function listSkillDirs(): Promise<string[]> {
  try {
    const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

async function readText(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function parseSkillFrontmatter(text: string): Record<string, string> | null {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const fm: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const match = line.match(/^([A-Za-z0-9_-]+):[ \t]+(.*)$/);
    if (match && match[1] && match[2] !== undefined) {
      fm[match[1]] = match[2].trim();
    }
  }
  return fm;
}

function extractMarkdownLinks(text: string): string[] {
  const links: string[] = [];
  const regex = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) links.push(match[2]);
  }
  return links;
}

function stripLinkSuffixes(raw: string): string {
  return raw.split(/[?#]/u)[0] ?? raw;
}

function isKebabSafe(name: string): boolean {
  return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
}

function parsePromptSettings(
  text: string,
): { tags: boolean; maxTurns: number; timeoutSeconds: number; tools: string[] } | null {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const block = text.slice(4, end);

  const tagsMatch = block.match(/^tags:[ \t]+\[skill-creator\]$/m);
  const maxTurnsMatch = block.match(/^max_turns:[ \t]+(\d+)$/m);
  const timeoutMatch = block.match(/^timeout_seconds:[ \t]+(\d+)$/m);
  const toolsMatch = block.match(/^allowed_tools:[ \t]+\[(.*)\]$/m);

  if (!tagsMatch || !maxTurnsMatch || !timeoutMatch || !toolsMatch) return null;

  const maxTurns = Number.parseInt(maxTurnsMatch[1]!, 10);
  const timeoutSeconds = Number.parseInt(timeoutMatch[1]!, 10);
  const tools = toolsMatch[1]!
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return { tags: true, maxTurns, timeoutSeconds, tools };
}

test("all expected skills exist with valid SKILL.md frontmatter", async () => {
  const skills = await listSkillDirs();
  for (const name of EXPECTED_SKILLS) {
    expect(skills).toContain(name);
  }

  const seenNames = new Set<string>();
  for (const name of skills) {
    const skillPath = join(SKILLS_DIR, name, "SKILL.md");
    const text = await readText(skillPath);
    expect(text, `${skillPath} must exist`).not.toBeNull();
    if (text === null) continue;

    const fm = parseSkillFrontmatter(text);
    expect(fm, `${skillPath} must have frontmatter`).not.toBeNull();
    if (fm === null) continue;

    expect(fm.name, `${skillPath} name must match directory`).toBe(name);
    expect(fm.description?.length ?? 0, `${skillPath} description must not be empty`).toBeGreaterThan(0);
    expect(seenNames.has(fm.name ?? ""), `${skillPath} name must be unique`).toBe(false);
    seenNames.add(fm.name ?? "");
  }
});

test("relative links in SKILL.md and source docs point to existing paths", async () => {
  const docsToCheck: string[] = [];
  for (const name of await listSkillDirs()) {
    docsToCheck.push(join(SKILLS_DIR, name, "SKILL.md"));
  }
  docsToCheck.push(...SOURCE_DOCS);

  for (const docPath of docsToCheck) {
    const text = await readText(docPath);
    if (text === null) {
      expect(false, `${docPath} must exist`).toBe(true);
      continue;
    }

    const dir = dirname(docPath);
    for (const raw of extractMarkdownLinks(text)) {
      if (/^(https?:|mailto:|#)/i.test(raw)) continue;
      if (raw.startsWith("/")) continue;

      const target = resolve(dir, decodeURI(stripLinkSuffixes(raw)));
      const info = await stat(target).catch(() => null);
      expect(info?.isFile() || info?.isDirectory(), `broken link ${raw} in ${docPath}`).toBe(true);
    }
  }
});

test("eval cases have required structure and prompt settings", async () => {
  const skills = await listSkillDirs();
  for (const name of EXPECTED_SKILLS) {
    expect(skills).toContain(name);
  }

  for (const name of skills) {
    const evalsDir = join(SKILLS_DIR, name, "evals");
    const caseNames = await readdir(evalsDir).catch(() => []);
    const caseDirs = [];
    for (const caseName of caseNames) {
      const caseDir = join(evalsDir, caseName);
      const info = await stat(caseDir).catch(() => null);
      if (info?.isDirectory()) caseDirs.push(caseName);
    }

    const required = EXPECTED_CASES[name] ?? [];
    for (const requiredName of required) {
      expect(caseDirs, `${evalsDir} must contain ${requiredName}`).toContain(requiredName);
    }

    for (const caseName of caseDirs) {
      const caseDir = join(evalsDir, caseName);
      expect(isKebabSafe(caseName), `${caseDir} name must be kebab-safe`).toBe(true);

      const promptPath = join(caseDir, "prompt.md");
      const promptText = await readText(promptPath);
      expect(promptText, `${promptPath} must exist`).not.toBeNull();
      if (promptText === null) continue;

      const settings = parsePromptSettings(promptText);
      expect(settings, `${promptPath} must have valid frontmatter settings`).not.toBeNull();
      if (settings === null) continue;
      expect(settings.maxTurns, `${promptPath} max_turns must be positive`).toBeGreaterThan(0);
      expect(settings.timeoutSeconds, `${promptPath} timeout_seconds must be positive`).toBeGreaterThan(0);
      expect(settings.tools.length, `${promptPath} allowed_tools must not be empty`).toBeGreaterThan(0);
      for (const tool of settings.tools) {
        expect(READ_ONLY_TOOLS.has(tool), `${promptPath} tool ${tool} must be read-only`).toBe(true);
      }

      const yamlPath = join(caseDir, "case.yaml");
      const yamlText = await readText(yamlPath);
      expect(yamlText, `${yamlPath} must exist`).not.toBeNull();
      if (yamlText === null) continue;

      expect(yamlText, `${yamlPath} schema_version must be "1.1"`).toMatch(/^schema_version:\s*"1\.1"$/m);
      expect(yamlText, `${yamlPath} name must match directory`).toMatch(new RegExp(`^name:\\s*${caseName}$`, "m"));
      const outcomeMatch = yamlText.match(/^expected_outcome:\s*\|\n((?:[ \t]+.*\n?)*)/m);
      expect(outcomeMatch, `${yamlPath} must declare expected_outcome as literal block`).not.toBeNull();
      const outcomeBody = outcomeMatch?.[1] ?? "";
      expect(outcomeBody.trim().length, `${yamlPath} expected_outcome must be non-empty`).toBeGreaterThan(0);

      const gradersDir = join(caseDir, "graders");
      const graderFiles = (await readdir(gradersDir).catch(() => [])).filter((f) => f.endsWith(".md"));
      expect(graderFiles.length, `${gradersDir} must have at least one .md grader`).toBeGreaterThan(0);

      for (const graderFile of graderFiles) {
        const graderPath = join(gradersDir, graderFile);
        const graderText = await readText(graderPath);
        expect(graderText, `${graderPath} must exist`).not.toBeNull();
        if (graderText === null) continue;

        const fm = parseSkillFrontmatter(graderText);
        expect(fm, `${graderPath} must have frontmatter`).not.toBeNull();
        if (fm === null) continue;
        expect(fm.type, `${graderPath} type`).toBe("llm");
        expect(fm.focus, `${graderPath} focus`).toBe("trace");
        expect(fm.weight, `${graderPath} weight`).toBe("1");

        const bodyStart = graderText.indexOf("\n---\n", 4);
        const body = bodyStart === -1 ? "" : graderText.slice(bodyStart + 5);
        expect(body.trim().length, `${graderPath} grader body must be non-empty`).toBeGreaterThan(0);
      }
    }
  }
});
