import workerpool from "workerpool";
import path from "path";
import keccak256 from "keccak256";
import fs from "fs";
import chalk from "chalk";
import Parser from "./use/Parser.js";
import Paint from "./use/Paint.js";
import Metadata from "./use/Metadata.js";

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

const loadLayerImg = async (_layer) => {
  return new Promise(async (resolve) => {
    // selected elements is an array.
    const image = await loadImage(`${_layer.path}`).catch((err) =>
      console.log(chalk.redBright(`failed to load ${_layer.path}`, err))
    );
    resolve({ layer: _layer, loadedImage: image });
  });
};

const saveMetaDataSingleFile = (_editionCount, _buildDir) => {
  let metadata = Metadata.metadataList.find(
    (meta) => meta.edition == _editionCount
  );
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
  const { dna, layerConfigIndex } = layerData;
  // Save the canvas buffer to file
  saveImage(tokenIndex, _buildDir, _canvas);

  const { _imageHash, _prefix, _offset } = postProcessMetadata(layerData);

  const metadata = Metadata.addMetadata(dna, tokenIndex, {
    _prefix,
    _offset,
    _imageHash,
  });

  saveMetaDataSingleFile(tokenIndex, _buildDir);
  console.log(chalk.cyan(`Created edition: ${tokenIndex}`));

  return metadata;
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
      const indexAddress = Parser.cleanDna(img);

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
  Paint.sortZIndex(allImages).forEach((layer) => {
    loadedElements.push(loadLayerImg(layer));
  });

  const renderObjectArray = await Promise.all(loadedElements);

  const layerData = {
    dna,
    layerConfigIndex,
    tokenIndex,
    _background: background,
  };
  Paint.paintLayers(ctxMain, renderObjectArray, layerData, format);

  const metadata = outputFiles(tokenIndex, layerData);
  return metadata;
}

workerpool.worker({
  generate,
});
