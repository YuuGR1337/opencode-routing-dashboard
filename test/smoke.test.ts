import { expect, test } from "bun:test";
import { VERSION } from "../src/cli";

test("requested v0.2.0 loads", () => {
  expect(VERSION).toBe("0.2.0");
});
