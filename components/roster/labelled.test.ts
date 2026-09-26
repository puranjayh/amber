import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { LabelledRows } from "./LabelledRows";

test("the labelled row is the default and met/unknown is the large figure", () => {
  const markup = renderToStaticMarkup(
    createElement(LabelledRows, {
      label: "Worklist",
      rows: [
        {
          key: "PT-1",
          rank: 1,
          patient: "A. Chen, 59",
          trial: "Osimertinib and Necitumumab",
          met: 22,
          total: 27,
          blocking: "No absolute neutrophil count on file",
          tier: "T1 blood draw or in-clinic",
        },
      ],
    }),
  );
  for (const label of ["Patient", "Best trial", "Met", "Blocking", "Resolution tier"]) {
    expect(markup).toContain(label);
  }
  expect(markup).toContain("22");
  expect(markup).toContain("27");
  expect(markup).toContain(">22<span");
  expect(markup).toContain("/span>27");
  expect(markup).toContain("text-[24px]");
  expect(markup).toContain("grid-cols-2");
  expect(markup).toContain(">Compact<");
});
