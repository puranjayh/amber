import { expect, test } from "vitest";
import { parsePortalStore } from "./portal";

test("parsePortalStore ignores junk and keeps valid answers", () => {
  expect(parsePortalStore(null)).toEqual({});
  expect(parsePortalStore("not-json")).toEqual({});
  expect(parsePortalStore('{"PT-4401":{"maxTravelMinutes":90,"acceptsPlacebo":false,"driver":"family"}}')).toEqual({
    "PT-4401": { maxTravelMinutes: 90, acceptsPlacebo: false, driver: "family" },
  });
  expect(parsePortalStore('{"PT-4401":{"driver":"spaceship"}}')).toEqual({});
});
