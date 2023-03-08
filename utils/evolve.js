"use strict";

/**
 * Utility for regenerating the same output using the DNA file to
 * redraw each previously generated image.
 *
 * Optionally, you can reconfigure backgrounds,
 * turn off layers, e.g. backgrounds for transparent vertions
 * using --omit

 */

import fs from "fs";
import path from "path";
import { Command } from "commander";
import chalk from "chalk";
import util from "util";
import _canvas from "canvas";

import Paint from "../src/use/Paint.js";
import Parser from "../src/use/Parser.js";

//TODO: import needed mappings from config
import { format, layersOrder } from "../src/evolve-config.js";
import { layerConfigurations, background, outputJPEG } from "../config.js";

import {
  // addMetadata,
  // constructLayerToDna,
  DNA_DELIMITER,
  layersSetup,
  pickRandomElement,
  // loadLayerImg,
  // outputFiles,
  // paintLayers,
  // sortLayers,
  // Paint.sortZIndex,
  // writeMetaData,
} from "../src/main.js";

const { createCanvas } = _canvas;

const isLocal = typeof process.pkg === "undefined";
const basePath = isLocal ? process.cwd() : path.dirname(process.execPath);
const metadataFilePath = `${basePath}/build/json/_metadata.json`;
const outputDir = `${basePath}/build/evolve`;

//setup canvas
const canvas = createCanvas(format.width, format.height);
const ctxMain = canvas.getContext("2d");
ctxMain.imageSmoothingEnabled = format.smoothing;

// program cli
const program = new Command();

const setup = () => {
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, {
      recursive: true,
    });
  }
  fs.mkdirSync(outputDir);
  fs.mkdirSync(path.join(outputDir, "/json"));
  fs.mkdirSync(path.join(outputDir, "/images"));
  // fs.mkdirSync(path.join(metadataBuildPath, "/json"));
};

function parseEditionNumFromDNA(dnaStrand) {
  // clean dna of edition num
  const editionExp = /\d+\//;
  return Number(editionExp.exec(dnaStrand)[0].replace("/", ""));
}

function regenerateSingleMetadataFile() {
  const metadata = [];
  const metadatafiles = fs.readdirSync(path.join(outputDir, "/json"));

  console.log("\nBuilding _metadata.json");

  metadatafiles.forEach((file) => {
    const data = fs.readFileSync(path.join(outputDir, "/json", file));
    metadata.push(JSON.parse(data));
  });

  fs.writeFileSync(
    path.join(outputDir, "json", "_metadata.json"),
    JSON.stringify(metadata, null, 2)
  );
}

/**
 * given the _same_ set of layers as the original *required:
 * use the attributes trait_type and trait_value to recreate the token dna.
 *
 * @param {Array} _layers constructed set of _all_ available generator layers
 *  from layersSetup.
 * @param {Object[]} _attributes metadata attributes array to build DNA from
 * @returns {Object[]} appends .DNA:[string] to the attributes for use later
 *  in the generator
 */
//TODO: move to utils
function reverseLookup(_layers, _attributes) {
  //
}

/**
 * Similar in function to the main createDNA
 * except, when a layer has evolve-config, the
 * evolve-config settings are used.
 *
 *  when constant == true, all traits for that layer
 *    are mapped.
 *  when mapping == true, the single mapping for that trait
 *    is used
 */
function createEvolveDna(_layers, _attributes) {
  let dnaSequence = [];
  let incompatibleDNA = [];
  let forcedDNA = [];

  _layers.forEach((layer) => {
    const layerSequence = [];

    if (layer.constant === true) {
      // use the mapped folder
      const trait = _attributes.find((t) => t.trait_type == layer.name);

      // get the file path, recursively and find
      // the 'element' that === trait.value
      const forcedPick = layer.elements.find((element) => {
        function rFind(sublayer, els) {
          if (sublayer.sublayer == true) {
            for (let e = 0; e < sublayer.elements.length; e++) {
              rFind(sublayer.elements[e]);
            }
          }
          return sublayer.traitValue == trait.value;
          // rFind(element.elements);
        }

        // element.traitValue == trait.value
        // console.log(`finding ${trait.value} :in : ${element.traitValue}`);
        return rFind(element);
      });

      if (forcedPick.elements?.length > 0) {
        forcedPick.elements.forEach((img) => {
          dnaSequence.push(
            `${layer.id}.${img.id}:${img.zindex}${img.filename}`
          );
        });
      } else {
        // return a DNA string
        let dnaString = `${layer.id}.${forcedPick.id}:${forcedPick.zindex}${forcedPick.filename}`;
        dnaSequence.push(dnaString);
      }
      const sortedLayers = Paint.sortLayers(layerSequence);
      dnaSequence = [...dnaSequence, [sortedLayers]];
    } else if (layer.mappings) {
      // pick the image from the mapping
      // trait_value: /image/path
    }
    // if no mapping is present, use a random pick.
    else {
      pickRandomElement(
        layer,
        layerSequence,
        layer.id,
        incompatibleDNA,
        forcedDNA,
        layer.bypassDNA ? "?bypassDNA=true" : "",
        layer.zindex ? layer.zIndex : ""
      );
      const sortedLayers = Paint.sortLayers(layerSequence);
      dnaSequence = [...dnaSequence, [sortedLayers]];
    }
  });
  const zSortDNA = Paint.sortByZ(dnaSequence.flat(2));
  const dnaStrand = zSortDNA.join(DNA_DELIMITER);

  return dnaStrand;
}
/**
 * Given a given previously generated token metadata,
 * use the layers and layers order in evolve-config.js
 * generate the layers as normal, except when encountering
 * a layer with mapping.
 * when a mapping is found for a given attribute, use the mapped
 * directory/file to choose an image to add to the stack.
 *
 *
 */
const evolve = async (metadata, options) => {
  /**
   * TODO:
   * The Dna needs to store background generation color
   * if it is to be re constructed properly
   */
  const canvas = createCanvas(format.width, format.height);
  const ctxMain = canvas.getContext("2d");
  let layerConfigIndex = 0;
  let abstractedIndexes = [];
  let drawIndex = 0;

  for await (const token of metadata) {
    setTimeout(() => {
      console.log("async", token);
    }, 200);
  }
  metadata.forEach(async (token) => {
    console.log(`Building Token #${token.edition}`);

    const layers = layersSetup(layersOrder);
    console.log({ drawIndex, len: metadata.length });

    let loadedElements = [];
    // loop over the dna data, check if it is an array or a string, if string, make arayy
    // options.debug && options.verbose
    //   ? console.log("dna strand type", typeof dnaStrand)
    //   : null;

    // clean dna of edition num
    const editionExp = /\d+\//;

    let _dna = createEvolveDna(layers, token.attributes);
    const dna = _dna.split(DNA_DELIMITER);
    // options.debug ? console.log("Rebuilding DNA:", images) : null;
    let selectedElements = [];
    let mappedDnaToLayers = layers.map((layer, index) => {
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
        }, layers); //returns string, need to return

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

    console.log(util.inspect(mappedDnaToLayers, false, null, true));
    // then, draw each layer using the address lookup
    // reduce the stacked and nested layer into a single array
    const allImages = mappedDnaToLayers.reduce((images, layer) => {
      let nestedImages = [];
      if (layer.selectedElements.sublayer == true) {
        nestedImages = layer.elements.map((subImage) =>
          subImage.weight == "required" ? subImage.filename : ""
        );
      }
      return [...images, ...layer.selectedElements, ...nestedImages];
    }, []);

    console.log({ allImages: allImages.map((i) => i.filename) });
    // sort by z-index.
    Paint.sortZIndex(allImages).forEach((layer) => {
      loadedElements.push(Paint.loadLayerImg(layer));
    });

    await Promise.all(loadedElements).then(async (renderObjectArray) => {
      const layerData = {
        dnaStrand: "",
        layerConfigIndex,
        abstractedIndexes,
        _background: background,
      };
      Paint.paintLayers(ctxMain, renderObjectArray, layerData, format);

      outputFiles(abstractedIndexes, layerData, outputDir, canvas);
      drawIndex++;
      abstractedIndexes.shift();
    });
  });

  Promise.resolve();
};

program
  .option("-s, --source <source>", "Optional source path of _metadata.json")
  .option("-d, --debug", "display additional logging")
  .option("-v, --verbose", "display even more additional logging")
  .action(async (options, command) => {
    const metadata = options.source
      ? JSON.parse(fs.readFileSync(path.join(basePath, options.source)))
      : JSON.parse(fs.readFileSync(metadataFilePath));

    options.debug && options.verbose
      ? console.log("Loaed DNA data\n", metadata)
      : null;

    console.log(chalk.greenBright.inverse(`\Generating new version...`));

    setup();
    await evolve(metadata, options);
    // regenerateSingleMetadataFile();
    console.log(chalk.green("DONE"));
  });

program.parse();
