import fs from "fs";
import path from "path";
import Parser from "./Parser.js";
import Metadata from "./Metadata.js";
import _canvas from "canvas";
import chalk from "chalk";
const { createCanvas, loadImage } = _canvas;

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
   * Sorting by index based on the layer.z property
   * @param {Array } layers selected Image layer objects array
   */
  sortZIndex(layers) {
    const parseZIndex = (str) => {
      const zflag = /(z-?\d*,)/;
      const z = zflag.exec(str);
      return z ? parseInt(z[0].match(/-?\d+/)[0]) : null;
    };

    return layers.sort((a, b) => {
      const indexA = parseZIndex(a.zindex);
      const indexB = parseZIndex(b.zindex);
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

  drawElement(_renderObject, format) {
    const layerCanvas = createCanvas(format.width, format.height);
    const layerctx = layerCanvas.getContext("2d");
    layerctx.imageSmoothingEnabled = format.smoothing;

    layerctx.drawImage(
      _renderObject.loadedImage,
      0,
      0,
      format.width,
      format.height
    );

    Metadata.addAttributes(_renderObject);
    return layerCanvas;
  },

  async loadLayerImg(_layer) {
    return new Promise(async (resolve) => {
      // selected elements is an array.
      const image = await loadImage(`${_layer.path}`).catch((err) =>
        console.log(chalk.redBright(`failed to load ${_layer.path}`, err))
      );
      resolve({ layer: _layer, loadedImage: image });
    });
  },

  drawBackground(canvasContext, background, format) {
    canvasContext.fillStyle = background.HSL ?? background.color;

    canvasContext.fillRect(0, 0, format.width, format.height);
  },

  /**
   * Paints the given renderOjects to the main canvas context.
   *
   * @param {Array} renderObjectArray Array of render elements to draw to canvas
   * @param {Object} layerData data passed from the current iteration of the loop or configured dna-set
   *
   */
  paintLayers(canvasContext, renderObjectArray, layerData, format) {
    // debugLogs ? console.log("\nClearing canvas") : null;
    canvasContext.clearRect(0, 0, format.width, format.height);

    const { _background } = layerData;

    renderObjectArray.forEach((renderObject) => {
      // one main canvas
      // each render Object should be a solo canvas
      // append them all to main canbas
      canvasContext.globalAlpha = renderObject.layer.opacity;
      canvasContext.globalCompositeOperation = renderObject.layer.blendmode;
      canvasContext.drawImage(
        this.drawElement(renderObject, format),
        0,
        0,
        format.width,
        format.height
      );
    });

    if (_background.generate) {
      canvasContext.globalCompositeOperation = "destination-over";
      this.drawBackground(canvasContext, _background, format);
    }
  },
};
