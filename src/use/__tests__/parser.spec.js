import { describe, expect, test } from "vitest";

import Parser from "../Parser";

console.log(Parser);
describe("Rarity Weights", () => {
  test("Parses '#' weight for .png's", async () => {
    const file = "something#55.png";
    const result = Parser.getRarityWeight(file, "#");

    expect(result).to.equal(55);
  });

  test("Parses '%' weight for .png's", async () => {
    const file = "something%55.png";
    const result = Parser.getRarityWeight(file, "%");

    expect(result).to.equal(55);
  });

  test("Parses '#' weight for .jpg's", async () => {
    const file = "something#55.jpg";
    const result = Parser.getRarityWeight(file, "#");

    expect(result).to.equal(55);
  });

  test("Parses '#' weight for folder", async () => {
    const file = "something#55";
    const result = Parser.getRarityWeight(file, "#");

    expect(result).to.equal(55);
  });
});
