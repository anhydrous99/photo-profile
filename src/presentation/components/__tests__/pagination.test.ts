/// <reference types="vitest/globals" />

import { describe, it, expect } from "vitest";
import { getPageNumbers } from "../Pagination";

describe("getPageNumbers", () => {
  it("returns [1] when total is 1", () => {
    const result = getPageNumbers(1, 1);
    expect(result).toEqual([1]);
  });

  it("returns [1, 2] when total is 2", () => {
    const result = getPageNumbers(1, 2);
    expect(result).toEqual([1, 2]);
  });

  it("returns all pages [1, 2, 3, 4, 5, 6, 7] when total is 7 (boundary)", () => {
    const result = getPageNumbers(4, 7);
    expect(result).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("returns [1, 2, ellipsis, 10] when total is 10 and current is 1 (first page)", () => {
    const result = getPageNumbers(1, 10);
    expect(result).toEqual([1, 2, "ellipsis", 10]);
  });

  it("returns [1, ellipsis, 9, 10] when total is 10 and current is 10 (last page)", () => {
    const result = getPageNumbers(10, 10);
    expect(result).toEqual([1, "ellipsis", 9, 10]);
  });

  it("returns [1, ellipsis, 4, 5, 6, ellipsis, 10] when total is 10 and current is 5 (middle)", () => {
    const result = getPageNumbers(5, 10);
    expect(result).toEqual([1, "ellipsis", 4, 5, 6, "ellipsis", 10]);
  });

  it("returns [1, 2, 3, 4, ellipsis, 10] when total is 10 and current is 3 (near start, no leading ellipsis)", () => {
    const result = getPageNumbers(3, 10);
    expect(result).toEqual([1, 2, 3, 4, "ellipsis", 10]);
  });

  it("returns [1, ellipsis, 7, 8, 9, 10] when total is 10 and current is 8 (near end, no trailing ellipsis)", () => {
    const result = getPageNumbers(8, 10);
    expect(result).toEqual([1, "ellipsis", 7, 8, 9, 10]);
  });

  it("returns [1, ellipsis, 3, 4, 5, ellipsis, 8] when total is 8 and current is 4", () => {
    const result = getPageNumbers(4, 8);
    expect(result).toEqual([1, "ellipsis", 3, 4, 5, "ellipsis", 8]);
  });
});
