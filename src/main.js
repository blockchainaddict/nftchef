"use strict";

const path = require("path");
const isLocal = typeof process.pkg === "undefined";
const basePath = isLocal ? process.cwd() : path.dirname(process.execPath);
const fs = require("fs");
const chalk = require("chalk");

const workerpool = require('workerpool');
const pool = workerpool.pool(__dirname + '/worker.js', {
  workerType: 'process'
});

console.log(path.join(basePath, "/src/config.js"));
const {
  buildDir,
  debugLogs,
  emptyLayerName,
  forcedCombinations,
  incompatible,
  layerConfigurations,
  layersDir,
  rarityDelimiter,
  shuffleLayerConfigurations,
  startIndex,
  traitValueOverrides,
  uniqueDnaTorrance,
  useRootTraitType,
} = require(path.join(basePath, "/src/config.js"));

// when generating a random background used to add to DNA
let generatedBackground;

let dnaList = new Set(); // internal+external: list of all files. used for regeneration etc
let uniqueDNAList = new Set(); // internal: post-filtered dna set for bypassDNA etc.
const DNA_DELIMITER = "*";

const zflag = /(z-?\d*,)/;

const buildSetup = () => {
  if (fs.existsSync(buildDir)) {
    fs.rmdirSync(buildDir, { recursive: true });
  }
  fs.mkdirSync(buildDir);
  fs.mkdirSync(path.join(buildDir, "/json"));
  fs.mkdirSync(path.join(buildDir, "/images"));
};

const getRarityWeight = (_path) => {
  // check if there is an extension, if not, consider it a directory
  const exp = new RegExp(`${rarityDelimiter}(\\d*)`, "g");
  const weight = exp.exec(_path);
  const weightNumber = weight ? Number(weight[1]) : -1;

  if (weightNumber < 0 || isNaN(weightNumber)) {
    return "required";
  }
  return weightNumber;
};

const cleanName = (_str) => {
  const hasZ = zflag.test(_str);

  const zRemoved = _str.replace(zflag, "");

  const extension = /\.[0-9a-zA-Z]+$/;
  const hasExtension = extension.test(zRemoved);
  let nameWithoutExtension = hasExtension ? zRemoved.slice(0, -4) : zRemoved;
  var nameWithoutWeight = nameWithoutExtension.split(rarityDelimiter).shift();
  return nameWithoutWeight;
};

const parseQueryString = (filename, layer, sublayer) => {
  const query = /\?(.*)\./;
  const querystring = query.exec(filename);
  if (!querystring) {
    return getElementOptions(layer, sublayer);
  }

  const layerstyles = querystring[1].split("&").reduce((r, setting) => {
    const keyPairs = setting.split("=");
    return { ...r, [keyPairs[0]]: keyPairs[1] };
  }, []);

  return {
    blendmode: layerstyles.blend
      ? layerstyles.blend
      : getElementOptions(layer, sublayer).blendmode,
    opacity: layerstyles.opacity
      ? layerstyles.opacity / 100
      : getElementOptions(layer, sublayer).opacity,
  };
};

/**
 * Get't the layer options from the parent, or grandparent layer if
 * defined, otherwise, sets default options.
 *
 * @param {Object} layer the parent layer object
 * @param {String} sublayer Clean name of the current layer
 * @returns {blendmode, opacity} options object
 */
const getElementOptions = (layer, sublayer) => {
  let blendmode = "source-over";
  let opacity = 1;
  if (layer.sublayerOptions?.[sublayer]) {
    const options = layer.sublayerOptions[sublayer];

    options.bypassDNA !== undefined ? (bypassDNA = options.bypassDNA) : null;
    options.blend !== undefined ? (blendmode = options.blend) : null;
    options.opacity !== undefined ? (opacity = options.opacity) : null;
  } else {
    // inherit parent blend mode
    blendmode = layer.blend != undefined ? layer.blend : "source-over";
    opacity = layer.opacity != undefined ? layer.opacity : 1;
  }
  return { blendmode, opacity };
};

const parseZIndex = (str) => {
  const z = zflag.exec(str);
  return z ? parseInt(z[0].match(/-?\d+/)[0]) : null;
};

const getElements = (path, layer) => {
  return fs
    .readdirSync(path)
    .filter((item) => {
      const invalid = /(\.ini)/g;
      return !/(^|\/)\.[^\/\.]/g.test(item) && !invalid.test(item);
    })
    .map((i, index) => {
      const name = cleanName(i);
      const extension = /\.[0-9a-zA-Z]+$/;
      const sublayer = !extension.test(i);
      const weight = getRarityWeight(i);

      const { blendmode, opacity } = parseQueryString(i, layer, name);
      //pass along the zflag to any children
      const zindex = zflag.exec(i)
        ? zflag.exec(i)[0]
        : layer.zindex
          ? layer.zindex
          : "";

      const element = {
        sublayer,
        weight,
        blendmode,
        opacity,
        id: index,
        name,
        filename: i,
        path: `${path}${i}`,
        zindex,
      };

      if (sublayer) {
        element.path = `${path}${i}`;
        const subPath = `${path}${i}/`;
        const sublayer = { ...layer, blend: blendmode, opacity, zindex };
        element.elements = getElements(subPath, sublayer);
      }

      // Set trait type on layers for metadata
      const lineage = path.split("/");
      let typeAncestor;

      if (weight !== "required") {
        typeAncestor = element.sublayer ? 3 : 2;
      }
      if (weight === "required") {
        typeAncestor = element.sublayer ? 1 : 3;
      }
      // we need to check if the parent is required, or if it's a prop-folder
      if (
        useRootTraitType &&
        lineage[lineage.length - typeAncestor].includes(rarityDelimiter)
      ) {
        typeAncestor += 1;
      }

      const parentName = cleanName(lineage[lineage.length - typeAncestor]);

      element.trait = layer.sublayerOptions?.[parentName]
        ? layer.sublayerOptions[parentName].trait
        : layer.trait !== undefined
          ? layer.trait
          : parentName;

      const rawTrait = getTraitValueFromPath(element, lineage);
      const trait = processTraitOverrides(rawTrait);
      element.traitValue = trait;

      return element;
    });
};

const getTraitValueFromPath = (element, lineage) => {
  // If the element is a required png. then, the trait property = the parent path
  // if the element is a non-required png. black%50.png, then element.name is the value and the parent Dir is the prop
  if (element.weight !== "required") {
    return element.name;
  } else if (element.weight === "required") {
    // if the element is a png that is required, get the traitValue from the parent Dir
    return element.sublayer ? true : cleanName(lineage[lineage.length - 2]);
  }
};

/**
 * Checks the override object for trait overrides
 * @param {String} trait The default trait value from the path-name
 * @returns String trait of either overridden value of raw default.
 */
const processTraitOverrides = (trait) => {
  return traitValueOverrides[trait] ? traitValueOverrides[trait] : trait;
};

const layersSetup = (layersOrder) => {
  const layers = layersOrder.map((layerObj, index) => {
    return {
      id: index,
      name: layerObj.name,
      blendmode:
        layerObj["blend"] != undefined ? layerObj["blend"] : "source-over",
      opacity: layerObj["opacity"] != undefined ? layerObj["opacity"] : 1,
      elements: getElements(`${layersDir}/${layerObj.name}/`, layerObj),
      ...(layerObj.display_type !== undefined && {
        display_type: layerObj.display_type,
      }),
      bypassDNA:
        layerObj.options?.["bypassDNA"] !== undefined
          ? layerObj.options?.["bypassDNA"]
          : false,
    };
  });

  return layers;
};

/**
 * In some cases a DNA string may contain optional query parameters for options
 * such as bypassing the DNA isUnique check, this function filters out those
 * items without modifying the stored DNA.
 *
 * @param {String} _dna New DNA string
 * @returns new DNA string with any items that should be filtered, removed.
 */
const filterDNAOptions = (_dna) => {
  const filteredDNA = _dna.split(DNA_DELIMITER).filter((element) => {
    const query = /(\?.*$)/;
    const querystring = query.exec(element);
    if (!querystring) {
      return true;
    }
    // convert the items in the query string to an object
    const options = querystring[1].split("&").reduce((r, setting) => {
      const keyPairs = setting.split("=");
      //   construct the object →       {bypassDNA: bool}
      return { ...r, [keyPairs[0].replace("?", "")]: keyPairs[1] };
    }, []);
    // currently, there is only support for the bypassDNA option,
    // when bypassDNA is true, return false to omit from .filter
    return options.bypassDNA === "true" ? false : true;
  });

  return filteredDNA.join(DNA_DELIMITER);
};

/**
 * determine if the sanitized/filtered DNA string is unique or not by comparing
 * it to the set of all previously generated permutations.
 *
 * @param {String} _dna string
 * @returns isUnique is true if uniqueDNAList does NOT contain a match,
 *  false if uniqueDANList.has() is true
 */
const isDnaUnique = (_dna = []) => {
  const filtered = filterDNAOptions(_dna);
  return !uniqueDNAList.has(filterDNAOptions(_dna));
};

// expecting to return an array of strings for each _layer_ that is picked,
// should be a flattened list of all things that are picked randomly AND required
/**
 *
 * @param {Object} layer The main layer, defined in config.layerConfigurations
 * @param {Array} dnaSequence Strings of layer to object mappings to nesting structure
 * @param {Number*} parentId nested parentID, used during recursive calls for sublayers
 * @param {Array*} incompatibleDNA Used to store incompatible layer names while building DNA
 * @param {Array*} forcedDNA Used to store forced layer selection combinations names while building DNA
 * @param {Int} zIndex Used in the dna string to define a layers stacking order
 *  from the top down
 * @returns Array DNA sequence
 */
function pickRandomElement(
  layer,
  dnaSequence,
  parentId,
  incompatibleDNA,
  forcedDNA,
  bypassDNA,
  zIndex
) {
  let totalWeight = 0;
  // Does this layer include a forcedDNA item? ya? just return it.
  const forcedPick = layer.elements.find((element) =>
    forcedDNA.includes(element.name)
  );
  if (forcedPick) {
    debugLogs
      ? console.log(chalk.yellowBright(`Force picking ${forcedPick.name}/n`))
      : null;
    if (forcedPick.sublayer) {
      return dnaSequence.concat(
        pickRandomElement(
          forcedPick,
          dnaSequence,
          `${parentId}.${forcedPick.id}`,
          incompatibleDNA,
          forcedDNA,
          bypassDNA,
          zIndex
        )
      );
    }
    let dnaString = `${parentId}.${forcedPick.id}:${forcedPick.zindex}${forcedPick.filename}${bypassDNA}`;
    return dnaSequence.push(dnaString);
  }

  if (incompatibleDNA.includes(layer.name) && layer.sublayer) {
    debugLogs
      ? console.log(
        `Skipping incompatible sublayer directory, ${layer.name}`,
        layer.name
      )
      : null;
    return dnaSequence;
  }

  const compatibleLayers = layer.elements.filter(
    (layer) => !incompatibleDNA.includes(layer.name)
  );
  if (compatibleLayers.length === 0) {
    debugLogs
      ? console.log(
        chalk.yellow(
          "No compatible layers in the directory, skipping",
          layer.name
        )
      )
      : null;
    return dnaSequence;
  }

  compatibleLayers.forEach((element) => {
    // If there is no weight, it's required, always include it
    // If directory has %, that is % chance to enter the dir
    if (element.weight == "required" && !element.sublayer) {
      let dnaString = `${parentId}.${element.id}:${element.zindex}${element.filename}${bypassDNA}`;
      dnaSequence.unshift(dnaString);
      return;
    }
    // when the current directory is a required folder
    // and the element in the loop is another folder
    if (element.weight == "required" && element.sublayer) {
      const next = pickRandomElement(
        element,
        dnaSequence,
        `${parentId}.${element.id}`,
        incompatibleDNA,
        forcedDNA,
        bypassDNA,
        zIndex
      );
    }
    if (element.weight !== "required") {
      totalWeight += element.weight;
    }
  });
  // if the entire directory should be ignored…

  // number between 0 - totalWeight
  const currentLayers = compatibleLayers.filter((l) => l.weight !== "required");

  let random = Math.floor(Math.random() * totalWeight);

  for (var i = 0; i < currentLayers.length; i++) {
    // subtract the current weight from the random weight until we reach a sub zero value.
    // Check if the picked image is in the incompatible list
    random -= currentLayers[i].weight;

    // e.g., directory, or, all files within a directory
    if (random < 0) {
      // Check for incompatible layer configurations and only add incompatibilities IF
      // chosing _this_ layer.
      if (incompatible[currentLayers[i].name]) {
        debugLogs
          ? console.log(
            `Adding the following to incompatible list`,
            ...incompatible[currentLayers[i].name]
          )
          : null;
        incompatibleDNA.push(...incompatible[currentLayers[i].name]);
      }
      // Similar to incompaticle, check for forced combos
      if (forcedCombinations[currentLayers[i].name]) {
        debugLogs
          ? console.log(
            chalk.bgYellowBright.black(
              `\nSetting up the folling forced combinations for ${currentLayers[i].name}: `,
              ...forcedCombinations[currentLayers[i].name]
            )
          )
          : null;
        forcedDNA.push(...forcedCombinations[currentLayers[i].name]);
      }
      // if there's a sublayer, we need to concat the sublayers parent ID to the DNA srting
      // and recursively pick nested required and random elements
      if (currentLayers[i].sublayer) {
        return dnaSequence.concat(
          pickRandomElement(
            currentLayers[i],
            dnaSequence,
            `${parentId}.${currentLayers[i].id}`,
            incompatibleDNA,
            forcedDNA,
            bypassDNA,
            zIndex
          )
        );
      }

      // none/empty layer handler
      if (currentLayers[i].name === emptyLayerName) {
        return dnaSequence;
      }
      let dnaString = `${parentId}.${currentLayers[i].id}:${currentLayers[i].zindex}${currentLayers[i].filename}${bypassDNA}`;
      return dnaSequence.push(dnaString);
    }
  }
}

/**
 * given the nesting structure is complicated and messy, the most reliable way to sort
 * is based on the number of nested indecies.
 * This sorts layers stacking the most deeply nested grandchildren above their
 * immediate ancestors
 * @param {[String]} layers array of dna string sequences
 */
const sortLayers = (layers) => {
  const nestedsort = layers.sort((a, b) => {
    const addressA = a.split(":")[0];
    const addressB = b.split(":")[0];
    return addressA.length - addressB.length;
  });

  let stack = { front: [], normal: [], end: [] };
  stack = nestedsort.reduce((acc, layer) => {
    const zindex = parseZIndex(layer);
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

  return sortByZ(stack.front).concat(stack.normal).concat(sortByZ(stack.end));
};

/** File String sort by zFlag */
function sortByZ(dnastrings) {
  return dnastrings.sort((a, b) => {
    const indexA = parseZIndex(a);
    const indexB = parseZIndex(b);
    return indexA - indexB;
  });
}



const createDna = (_layers) => {
  let dnaSequence = [];
  let incompatibleDNA = [];
  let forcedDNA = [];

  _layers.forEach((layer) => {
    const layerSequence = [];
    pickRandomElement(
      layer,
      layerSequence,
      layer.id,
      incompatibleDNA,
      forcedDNA,
      layer.bypassDNA ? "?bypassDNA=true" : "",
      layer.zindex ? layer.zIndex : ""
    );
    const sortedLayers = sortLayers(layerSequence);
    dnaSequence = [...dnaSequence, [sortedLayers]];
  });
  const zSortDNA = sortByZ(dnaSequence.flat(2));
  const dnaStrand = zSortDNA.join(DNA_DELIMITER);

  return dnaStrand;
};

const writeMetaData = (_data) => {
  fs.writeFileSync(`${buildDir}/json/_metadata.json`, _data);
};

const writeDnaLog = (_data) => {
  fs.writeFileSync(`${buildDir}/_dna.json`, _data);
};



function shuffle(array) {
  let currentIndex = array.length,
    randomIndex;
  while (currentIndex != 0) {
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex],
      array[currentIndex],
    ];
  }
  return array;
}


const startCreating = async (storedDNA) => {
  if (storedDNA) {
    console.log(`using stored dna of ${storedDNA.size}`);
    dnaList = storedDNA;
    dnaList.forEach((dna) => {
      const editionExp = /\d+\//;
      const dnaWithoutEditionNum = dna.replace(editionExp, "");
      uniqueDNAList.add(filterDNAOptions(dnaWithoutEditionNum));
    });
  }
  let layerConfigIndex = 0;
  let editionCount = 1; //used for the growEditionSize while loop, not edition number
  let failedCount = 0;
  let abstractedIndexes = [];
  for (
    let i = startIndex;
    i <=
    startIndex +
    layerConfigurations[layerConfigurations.length - 1].growEditionSizeTo -
    1;
    i++
  ) {
    abstractedIndexes.push(i);
  }
  if (shuffleLayerConfigurations) {
    abstractedIndexes = shuffle(abstractedIndexes);
  }
  debugLogs
    ? console.log("Editions left to create: ", abstractedIndexes)
    : null;

  const generatorPromises = [];

  while (layerConfigIndex < layerConfigurations.length) {
    const layers = layersSetup(
      layerConfigurations[layerConfigIndex].layersOrder
    );

    let editionDNAs = [];

    while (
      editionCount <= layerConfigurations[layerConfigIndex].growEditionSizeTo
    ) {
      let newDna = createDna(layers);

      if (isDnaUnique(newDna)) {
        // prepend the same output num (abstractedIndexes[0])
        // to the DNA as the saved files.
        dnaList.add(
          `${abstractedIndexes[0]}/${newDna}${generatedBackground ? "___" + generatedBackground : ""
          }`
        );
        uniqueDNAList.add(filterDNAOptions(newDna));
        editionDNAs.push(newDna);
        editionCount++;
      } else {
        console.log(chalk.bgRed("DNA exists!"));
        failedCount++;
        if (failedCount >= uniqueDnaTorrance) {
          console.log(
            `You need more layers or elements to grow your edition to ${layerConfigurations[layerConfigIndex].growEditionSizeTo} artworks!`
          );
          process.exit();
        }
      }
    }

    editionDNAs.forEach((dna) => {
      const tokenIndex = abstractedIndexes.shift();

      generatorPromises.push(
        pool.exec('generate', [dna, layers, DNA_DELIMITER, layerConfigIndex, tokenIndex])
      );
    });

    layerConfigIndex++;
  }

  Promise.all(generatorPromises).then(async (results) => {
    // Wait for all assets to be generated before writing the combined metadata
    writeMetaData(JSON.stringify(results, null, 2));
    pool.terminate();
  });

  writeDnaLog(JSON.stringify([...dnaList], null, 2));
};

module.exports = {
  buildSetup,
  cleanName,
  createDna,
  DNA_DELIMITER,
  getElements,
  isDnaUnique,
  layersSetup,
  parseQueryString,
  startCreating,
  writeMetaData,
};
