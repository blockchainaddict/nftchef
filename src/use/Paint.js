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
};
