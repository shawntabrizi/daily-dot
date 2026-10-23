import { describe, expect, it } from "vitest";

import {
  generateCountryShapes,
  renderCountryShapes,
} from "./generate-country-shapes";

function feature(
  properties: Record<string, unknown>,
  geometry: unknown,
): Record<string, unknown> {
  return { type: "Feature", properties, geometry };
}

const square = [
  [10.04, 5.01],
  [10.96, 5.01],
  [10.96, 5.99],
  [10.04, 5.99],
  [10.04, 5.01],
];

const fixture = {
  type: "FeatureCollection",
  features: [
    feature(
      { TYPE: "Sovereign country", NAME: "Alpha", ISO_A3_EH: "ALP" },
      {
        type: "Polygon",
        coordinates: [square, [[10.4, 5.4], [10.6, 5.4], [10.6, 5.6], [10.4, 5.6], [10.4, 5.4]]],
      },
    ),
    feature(
      { TYPE: "Country", NAME: "Zulu", ISO_A3_EH: "-99" },
      {
        type: "MultiPolygon",
        coordinates: [
          [square.map(([x, y]) => [x + 20, y])],
          // A speck that quantises to under four points is noise, not land.
          [[[40, 1], [40.01, 1], [40.01, 1.01], [40, 1]]],
        ],
      },
    ),
    feature(
      { TYPE: "Dependency", NAME: "Skip me", ISO_A3_EH: "SKP" },
      { type: "Polygon", coordinates: [square] },
    ),
  ],
};

describe("generateCountryShapes", () => {
  it("quantises rings to 0.1°, drops closing points and specks, keeps holes", () => {
    const report = generateCountryShapes(JSON.stringify(fixture), [
      "ALP",
      "Zulu",
      "GHOST",
    ]);

    expect(report.shapes.map((shape) => shape.iso)).toEqual(["ALP", "Zulu"]);
    expect(report.shapes[0]!.rings).toEqual([
      [10, 5, 11, 5, 11, 6, 10, 6],
      [10.4, 5.4, 10.6, 5.4, 10.6, 5.6, 10.4, 5.6],
    ]);
    expect(report.shapes[1]!.rings).toEqual([[30, 5, 31, 5, 31, 6, 30, 6]]);
    expect(report.droppedRings).toBe(1);
    expect(report.centroidOnly).toEqual(["GHOST"]);
  });

  it("keeps the same identity rule as core.json so isos match", () => {
    const report = generateCountryShapes(JSON.stringify(fixture), ["Zulu"]);
    expect(report.shapes.map((shape) => shape.iso)).toEqual(["Zulu"]);
  });

  it("renders one shape per line and parses back", () => {
    const report = generateCountryShapes(JSON.stringify(fixture), ["ALP"]);
    const text = renderCountryShapes(report.shapes);
    expect(text.split("\n")).toHaveLength(4);
    expect(JSON.parse(text)).toEqual(report.shapes);
  });
});
