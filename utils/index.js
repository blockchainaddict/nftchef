"use strict";

import path, { resolve } from "path";
import fs from "fs";
import chalk from "chalk";

import { Command } from "commander";

import Paint from "../src/use/Paint.js";

import * as Config from "../config.js";
import Metadata from "../src/use/Metadata.js";

const isLocal = typeof process.pkg === "undefined";
const basePath = isLocal ? process.cwd() : path.dirname(process.execPath);
const program = new Command();

program
  .name("layermap")
  .option(
    "--layers -l",
    "optional location of layers dir. default is `layers/`"
  )
  .description(
    "save a txt folder map backup of your layers, *requires build/, saves to build/ folder"
  )
  .action((options) => {
    Metadata.layerMap(options);
  });

program.parse();

export default program;
