import { describe, expect, it } from "vitest";

import {
  generateCountryShapes,
  renderCountryShapes,
} from "./generate-country-shapes";

function feature(
  properties: Record<string, unknown>,
  geometry: unknown,
): Record<string, unknown> {
  return {
    type: "Feature",
    properties: { LABEL_X: 0, LABEL_Y: 0, CONTINENT: "Europe", ...properties },
    geometry,
  };
}

const square = [
  [10.04, 5.01],
  [10.96, 5.01],
  [10.96, 5.99],
  [10.04, 5.99],
  [10.04, 5.01],
];

// A city state about 0.004° across: every 0.1° grid point collapses.
const speck = [
  [12.452, 41.902],
  [12.456, 41.902],
  [12.456, 41.906],
  [12.452, 41.906],
  [12.452, 41.902],
];

const fixture = {
  type: "FeatureCollection",
  features: [
    feature(
      { NAME: "Alpha", SOVEREIGNT: "Alpha", ISO_A3_EH: "ALP" },
      {
        type: "Polygon",
        coordinates: [square, [[10.4, 5.4], [10.6, 5.4], [10.6, 5.6], [10.4, 5.6], [10.4, 5.4]]],
      },
    ),
    feature(
      { NAME: "Zulu", SOVEREIGNT: "Zulu", ISO_A3_EH: "-99" },
      {
        type: "MultiPolygon",
        coordinates: [
          [square.map(([x, y]) => [x! + 20, y])],
          // A speck that quantises to under four points is noise, not land.
          [[[40, 1], [40.01, 1], [40.01, 1.01], [40, 1]]],
        ],
      },
    ),
    feature(
      { NAME: "Tiny", SOVEREIGNT: "Tiny", ISO_A3_EH: "TNY" },
      { type: "Polygon", coordinates: [speck] },
    ),
    feature(
      { NAME: "Alpha Isles", SOVEREIGNT: "Alpha", ISO_A3_EH: "AIS" },
      { type: "Polygon", coordinates: [square.map(([x, y]) => [x! + 40, y])] },
    ),
  ],
};

describe("generateCountryShapes", () => {
  it("quantises rings to 0.1°, drops closing points and specks, keeps holes", () => {
    const report = generateCountryShapes(JSON.stringify(fixture), ["Alpha", "Tiny", "Zulu"]);

    expect(report.shapes.map((shape) => shape.id)).toEqual(["AIS", "ALP", "TNY", "Zulu"]);
    const alpha = report.shapes.find((shape) => shape.id === "ALP")!;
    expect(alpha.rings).toEqual([
      [10, 5, 11, 5, 11, 6, 10, 6],
      [10.4, 5.4, 10.6, 5.4, 10.6, 5.6, 10.4, 5.6],
    ]);
    expect(report.shapes.find((shape) => shape.id === "Zulu")!.rings).toEqual([
      [30, 5, 31, 5, 31, 6, 30, 6],
    ]);
    expect(report.droppedRings).toBe(1);
    expect(report.centroidOnly).toEqual([]);
  });

  it("keeps a feature's last ring on a finer grid instead of losing the country", () => {
    const report = generateCountryShapes(JSON.stringify(fixture), ["Alpha", "Tiny", "Zulu"]);
    expect(report.finerRings).toEqual(["TNY"]);
    expect(report.shapes.find((shape) => shape.id === "TNY")!.rings).toEqual([
      [12.452, 41.902, 12.456, 41.902, 12.456, 41.906, 12.452, 41.906],
    ]);
  });

  it("draws every place of the superset, a territory too, as just an id and rings", () => {
    const report = generateCountryShapes(JSON.stringify(fixture), ["Alpha", "Tiny", "Zulu"]);
    expect(report.shapes.find((shape) => shape.id === "AIS")).toEqual({
      id: "AIS",
      rings: [[50, 5, 51, 5, 51, 6, 50, 6]],
    });
  });

  it("simplifies a dense ring without moving its corners", () => {
    const dense: number[][] = [];
    for (let step = 0; step <= 100; step += 1) {
      dense.push([step / 10, 0]);
    }
    dense.push([10, 10], [0, 10], [0, 0]);
    const report = generateCountryShapes(
      JSON.stringify({
        type: "FeatureCollection",
        features: [feature({ NAME: "Dense", SOVEREIGNT: "Dense", ISO_A3_EH: "DNS" }, { type: "Polygon", coordinates: [dense] })],
      }),
      ["Dense"],
    );
    expect(report.shapes[0]!.rings).toEqual([[0, 0, 10, 0, 10, 10, 0, 10]]);
  });

  it("renders one shape per line, parses back and reruns byte-identically", () => {
    const source = JSON.stringify(fixture);
    const text = renderCountryShapes(generateCountryShapes(source, ["Alpha", "Tiny", "Zulu"]).shapes);
    expect(text.split("\n")).toHaveLength(7);
    expect(JSON.parse(text)).toEqual(
      generateCountryShapes(source, ["Alpha", "Tiny", "Zulu"]).shapes,
    );
    expect(renderCountryShapes(generateCountryShapes(source, ["Alpha", "Tiny", "Zulu"]).shapes)).toBe(text);
  });
});
