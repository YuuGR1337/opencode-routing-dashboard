import { expect, test } from "bun:test";
import { VERSION } from "../src/cli";
test("scaffold loads", () => { expect(VERSION).toBe("0.0.0"); });
