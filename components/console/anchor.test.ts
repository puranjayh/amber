import { expect, test } from "vitest";
import { getPair, getSweep } from "@/app/_data/source";

test("the four synthetic charts score the compiled osimertinib and PLB1004 trees", () => {
  const hero = getPair("PT-4410", "NCT02496663");
  const heroOther = getPair("PT-4410", "NCT06281964");
  const excl = getPair("PT-4411", "NCT02496663");
  const anc = getPair("PT-4412", "NCT02496663");
  const nudge = getPair("PT-4413", "NCT02496663");
  expect(hero && !hero.eliminated).toBe(true);
  expect(hero?.cells.filter((c) => ["INC-2", "INC-3", "INC-4", "INC-5", "INC-6"].includes(c.criterionId)).map((c) => c.reason)).toEqual([
    "absent",
    "absent",
    "absent",
    "absent",
    "absent",
  ]);
  expect(hero?.cells.find((c) => c.criterionId === "INC-9")?.verdict).toBe("PASS");
  expect(hero?.cells.find((c) => c.criterionId === "INC-7")?.verdict).toBe("PASS");
  expect(heroOther?.eliminated).toBe(true);
  expect(heroOther?.cells.find((c) => c.criterionId === "EXC-1")?.verdict).toBe("PASS");
  expect(excl?.eliminated).toBe(true);
  expect(excl?.cells.find((c) => c.criterionId === "INC-7")?.verdict).toBe("FAIL");
  expect(anc?.cells.find((c) => c.criterionId === "INC-10")?.verdict).toBe("FAIL");
  expect(nudge && !nudge.eliminated).toBe(true);

  const sweep = getSweep("NCT02496663", "INC-10");
  const at = (n: number) => sweep?.points.find((p) => p.threshold === n);
  expect(at(1400)!.eligibleCount).toBe(at(1500)!.eligibleCount + 1);
  expect(at(1500)!.excludedByThisAlone).toBe(1);
  expect(at(1400)!.excludedByThisAlone).toBe(0);
});
