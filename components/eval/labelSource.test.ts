import { expect, test } from "vitest";
import { isHumanValidated } from "./labelSource";

test("only an explicit human source is treated as validated", () => {
  expect(isHumanValidated("human")).toBe(true);
  expect(isHumanValidated("human-reviewed")).toBe(true);
  expect(isHumanValidated("model-draft")).toBe(false);
  expect(isHumanValidated("model")).toBe(false);
  expect(isHumanValidated("")).toBe(false);
});
