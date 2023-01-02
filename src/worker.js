import workerpool from "workerpool";
import path from "path";
import keccak256 from "keccak256";
import fs from "fs";
import chalk from "chalk";

console.log({ workerpool });

import _canvas from "canvas";
const { createCanvas, loadImage } = _canvas;

import {
  baseUri,
  buildDir,
  debugLogs,
  description,
  extraAttributes,
  extraMetadata,
  format,
  hashImages,
  layerConfigurations,
  outputJPEG,
} from "../config.js";

const isLocal = typeof process.pkg === "undefined";
const basePath = isLocal ? process.cwd() : path.dirname(process.execPath);
const canvas = createCanvas(format.width, format.height);
const ctxMain = canvas.getContext("2d");
ctxMain.imageSmoothingEnabled = format.smoothing;

let attributesList = [];
let metadataList = [];

// when generating a random background used to add to DNA

const addMetadata = (_dna, _edition, _prefixData) => {
  let dateTime = Date.now();
  const { _prefix, _offset, _imageHash } = _prefixData;

  const combinedAttrs = [...attributesList, ...extraAttributes()];
  const cleanedAttrs = combinedAttrs.reduce((acc, current) => {
    const x = acc.find((item) => item.trait_type === current.trait_type);
    if (!x) {
      return acc.concat([current]);
    } else {
      return acc;
    }
  }, []);

  let tempMetadata = {
    name: `${_prefix ? _prefix + " " : ""}#${_edition - _offset}`,
    description: description,
    image: `${baseUri}/${_edition}${outputJPEG ? ".jpg" : ".png"}`,
    ...(hashImages === true && { imageHash: _imageHash }),
    edition: _edition,
    date: dateTime,
    ...extraMetadata,
    attributes: cleanedAttrs,
    compiler: "HashLips Art Engine - NFTChef fork",
  };
  metadataList.push(tempMetadata);
  attributesList = [];
  return tempMetadata;
};

const addAttributes = (_element) => {
  let selectedElement = _element.layer;
  const layerAttributes = {
    trait_type: _element.layer.trait,
    value: selectedElement.traitValue,
    ...(_element.layer.display_type !== undefined && {
      display_type: _element.layer.display_type,
    }),
  };
  if (
    attributesList.some(
      (attr) => attr.trait_type === layerAttributes.trait_type
    )
  )
    return;
  attributesList.push(layerAttributes);
};

const loadLayerImg = async (_layer) => {
  return new Promise(async (resolve) => {
    // selected elements is an array.
    const image = await loadImage(`${_layer.path}`).catch((err) =>
      console.log(chalk.redBright(`failed to load ${_layer.path}`, err))
    );
    resolve({ layer: _layer, loadedImage: image });
  });
};

const drawElement = (_renderObject) => {
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

  addAttributes(_renderObject);
  return layerCanvas;
};

/**
 * Sorting by index based on the layer.z property
 * @param {Array } layers selected Image layer objects array
 */
function sortZIndex(layers) {
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
}

const saveMetaDataSingleFile = (_editionCount, _buildDir) => {
  let metadata = metadataList.find((meta) => meta.edition == _editionCount);
  debugLogs
    ? console.log(
        `Writing metadata for ${_editionCount}: ${JSON.stringify(metadata)}`
      )
    : null;
  fs.writeFileSync(
    `${_buildDir}/json/${_editionCount}.json`,
    JSON.stringify(metadata, null, 2)
  );
};

/**
 * Paints the given renderOjects to the main canvas context.
 *
 * @param {Array} renderObjectArray Array of render elements to draw to canvas
 * @param {Object} layerData data passed from the current iteration of the loop or configured dna-set
 *
 */
const paintLayers = (canvasContext, renderObjectArray, layerData) => {
  debugLogs ? console.log("\nClearing canvas") : null;
  canvasContext.clearRect(0, 0, format.width, format.height);

  const { _background } = layerData;

  renderObjectArray.forEach((renderObject) => {
    // one main canvas
    // each render Object should be a solo canvas
    // append them all to main canbas
    canvasContext.globalAlpha = renderObject.layer.opacity;
    canvasContext.globalCompositeOperation = renderObject.layer.blendmode;
    canvasContext.drawImage(
      drawElement(renderObject),
      0,
      0,
      format.width,
      format.height
    );
  });

  if (_background.generate) {
    canvasContext.globalCompositeOperation = "destination-over";
    drawBackground(canvasContext, _background);
  }
};

const postProcessMetadata = (layerData) => {
  const { tokenIndex, layerConfigIndex } = layerData;
  // Metadata options
  const savedFile = fs.readFileSync(
    `${buildDir}/images/${tokenIndex}${outputJPEG ? ".jpg" : ".png"}`
  );
  const _imageHash = hash(savedFile);

  // if there's a prefix for the current configIndex, then
  // start count back at 1 for the name, only.
  const _prefix = layerConfigurations[layerConfigIndex].namePrefix
    ? layerConfigurations[layerConfigIndex].namePrefix
    : null;
  // if resetNameIndex is turned on, calculate the offset and send it
  // with the prefix
  let _offset = 0;
  if (layerConfigurations[layerConfigIndex].resetNameIndex) {
    _offset = layerConfigurations[layerConfigIndex - 1].growEditionSizeTo;
  }

  return {
    _imageHash,
    _prefix,
    _offset,
  };
};

/**
 * Given some input, creates a sha256 hash.
 * @param {Object} input
 */
const hash = (input) => {
  const hashable = typeof input === "string" ? JSON.stringify(input) : input;
  return keccak256(hashable).toString("hex");
};

const outputFiles = (
  tokenIndex,
  layerData,
  _buildDir = buildDir,
  _canvas = canvas
) => {
  const { newDna, layerConfigIndex } = layerData;
  // Save the canvas buffer to file
  saveImage(tokenIndex, _buildDir, _canvas);

  const { _imageHash, _prefix, _offset } = postProcessMetadata(layerData);

  const metadata = addMetadata(newDna, tokenIndex, {
    _prefix,
    _offset,
    _imageHash,
  });

  saveMetaDataSingleFile(tokenIndex, _buildDir);
  console.log(chalk.cyan(`Created edition: ${tokenIndex}`));

  return metadata;
};

const cleanDna = (_str) => {
  var dna = _str.split(":").shift();
  return dna;
};

const drawBackground = (canvasContext, background) => {
  canvasContext.fillStyle = background.HSL ?? background.color;

  canvasContext.fillRect(0, 0, format.width, format.height);
};

const saveImage = (_editionCount, _buildDir, _canvas) => {
  fs.writeFileSync(
    `${_buildDir}/images/${_editionCount}${outputJPEG ? ".jpg" : ".png"}`,
    _canvas.toBuffer(`${outputJPEG ? "image/jpeg" : "image/png"}`)
  );
};

async function generate(
  _dna,
  _layers,
  DNA_DELIMITER,
  layerConfigIndex,
  background,
  tokenIndex
) {
  const dna = _dna.split(DNA_DELIMITER);
  let mappedDnaToLayers = _layers.map((layer, index) => {
    let selectedElements = [];
    const layerImages = dna.filter(
      (element) => element.split(".")[0] == layer.id
    );
    layerImages.forEach((img) => {
      const indexAddress = cleanDna(img);

      //

      const indices = indexAddress.toString().split(".");
      // const firstAddress = indices.shift();
      const lastAddress = indices.pop(); // 1
      // recursively go through each index to get the nested item
      let parentElement = indices.reduce((r, nestedIndex) => {
        if (!r[nestedIndex]) {
          throw new Error("wtf");
        }
        return r[nestedIndex].elements;
      }, _layers); //returns string, need to return

      selectedElements.push(parentElement[lastAddress]);
    });
    // If there is more than one item whose root address indicies match the layer ID,
    // continue to loop through them an return an array of selectedElements

    return {
      name: layer.name,
      blendmode: layer.blendmode,
      opacity: layer.opacity,
      selectedElements: selectedElements,
      ...(layer.display_type !== undefined && {
        display_type: layer.display_type,
      }),
    };
  });

  let results = mappedDnaToLayers;
  debugLogs ? console.log("DNA:", dna) : null;
  let loadedElements = [];
  // reduce the stacked and nested layer into a single array
  const allImages = results.reduce((images, layer) => {
    return [...images, ...layer.selectedElements];
  }, []);
  sortZIndex(allImages).forEach((layer) => {
    loadedElements.push(loadLayerImg(layer));
  });

  const renderObjectArray = await Promise.all(loadedElements);

  const layerData = {
    dna,
    layerConfigIndex,
    tokenIndex,
    _background: background,
  };
  paintLayers(ctxMain, renderObjectArray, layerData);

  const metadata = outputFiles(tokenIndex, layerData);
  return metadata;
}

workerpool.worker({
  generate,
});
