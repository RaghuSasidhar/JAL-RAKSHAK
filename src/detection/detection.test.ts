import { describe, expect, it } from "vitest";
import { applyHysteresis, isFlatLine, robustZ, thresholdStatus, worst } from "./index";

describe("thresholds (placeholder)", () => {
  it("pH outside 6.5-8.5 is a concern", () => {
    expect(thresholdStatus("ph", 6.4)).toBe("concern");
    expect(thresholdStatus("ph", 8.6)).toBe("concern");
    expect(thresholdStatus("ph", 7.4)).toBe("normal");
  });
  it("turbidity >1 concern, >5 strong", () => {
    expect(thresholdStatus("turbidity_ntu", 1.2)).toBe("concern");
    expect(thresholdStatus("turbidity_ntu", 5.5)).toBe("strong");
  });
  it("TDS >500 concern, >2000 strong", () => {
    expect(thresholdStatus("tds_mgl", 780)).toBe("concern");
    expect(thresholdStatus("tds_mgl", 2100)).toBe("strong");
  });
});

describe("anomaly", () => {
  it("learns until 48 readings", () => {
    expect(robustZ("tds_mgl", 400, Array(47).fill(310))).toBeNull();
  });
  it("flags |z|>4 after 48", () => {
    const h = Array.from({ length: 60 }, (_, i) => 310 + (i % 5) - 2);
    expect(Math.abs(robustZ("tds_mgl", 360, h)!)).toBeGreaterThan(4);
  });
});

it("flat-line after 10 identical values", () => {
  expect(isFlatLine(Array(10).fill(7.41))).toBe(true);
  expect(isFlatLine(Array(9).fill(7.41))).toBe(false);
});

it("hysteresis clears after 3 normal readings", () => {
  let s = { raised: true, streak: 0 };
  s = applyHysteresis(s.raised, s.streak, true);
  s = applyHysteresis(s.raised, s.streak, true);
  expect(s.raised).toBe(true);
  s = applyHysteresis(s.raised, s.streak, true);
  expect(s.raised).toBe(false);
});

it("no data outranks everything", () => {
  expect(worst(["strong", "nodata", "device"])).toBe("nodata");
});
