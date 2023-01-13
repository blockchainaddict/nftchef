"use strict";

import path from "path";
import fs from "fs";
import chalk from "chalk";
import Paint from "./src/use/Paint.js";
import Base from "./src/use/Base.js";
import * as Config from "./config.js";
import { Command } from "commander";

const isLocal = typeof process.pkg === "undefined";
const basePath = isLocal ? process.cwd() : path.dirname(process.execPath);
const program = new Command();

import { startCreating } from "./src/main.js";

program
  .name("generate")
  .option("-c, --continue <dna>", "Continues generatino using a _dna.json file")
  .action((options) => {
    console.log(chalk.green("genator started"), options.continue);
    options.continue
      ? console.log(
          chalk.bgCyanBright("\n continuing generation using _dna.json file \n")
        )
      : null;
    Base.buildSetup(Config.buildDir);
    let dna = null;
    if (options.continue) {
      const storedGenomes = JSON.parse(fs.readFileSync(options.continue));
      dna = new Set(storedGenomes);
      console.log({ dna });
    }

    startCreating(dna);
  });

program.parse();
