import Parser from "./Parser.js";

/**
 * Helper functions for the image generation/paining parts of the generate script
 */
export default {
  genColor(bg) {
    let hue = Math.floor(Math.random() * 360);
    let pastel = `hsl(${hue}, 100%, ${bg.brightness})`;
    // store the background color in the dna

    return pastel;
  },

  /** File String sort by Parser.zFlag */
  sortByZ(dnastrings) {
    return dnastrings.sort((a, b) => {
      const indexA = Parser.parseZIndex(a);
      const indexB = Parser.parseZIndex(b);
      return indexA - indexB;
    });
  },

  /**
   * given the nesting structure is complicated and messy, the most reliable way to sort
   * is based on the number of nested indecies.
   * This sorts layers stacking the most deeply nested grandchildren above their
   * immediate ancestors
   * @param {[String]} layers array of dna string sequences
   */
  sortLayers(layers) {
    const nestedsort = layers.sort((a, b) => {
      const addressA = a.split(":")[0];
      const addressB = b.split(":")[0];
      return addressA.length - addressB.length;
    });

    let stack = { front: [], normal: [], end: [] };
    stack = nestedsort.reduce((acc, layer) => {
      const zindex = Parser.parseZIndex(layer);
      if (!zindex)
        return { ...acc, normal: [...(acc.normal ? acc.normal : []), layer] };
      // move negative z into `front`
      if (zindex < 0)
        return { ...acc, front: [...(acc.front ? acc.front : []), layer] };
      // move positive z into `end`
      if (zindex > 0)
        return { ...acc, end: [...(acc.end ? acc.end : []), layer] };
      // make sure front and end are sorted
      // contat everything back to an ordered array
    }, stack);

    // sort the normal array
    stack.normal.sort();

    return this.sortByZ(stack.front)
      .concat(stack.normal)
      .concat(this.sortByZ(stack.end));
  },
};
