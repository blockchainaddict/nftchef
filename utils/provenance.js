import  keccak256 from "keccak256"
import  fs from "fs"
import  chalk from "chalk"
import path from "path"

const isLocal = typeof process.pkg === "undefined";
const basePath = isLocal ? process.cwd() : path.dirname(process.execPath);

import { buildDir } from "../src/config.js";
// Read files from the build folder defined in config.
const metadata = JSON.parse(
  fs.readFileSync(path.join(buildDir, `/json/_metadata.json`), "utf-8")
);

const accumulatedHashString = metadata.reduce((acc, item) => {
  return acc.concat(item.imageHash);
}, []);

const provenance = keccak256(accumulatedHashString.join("")).toString("hex");

fs.writeFileSync(
  `${buildDir}/_provenance.json`,
  JSON.stringify(
    { provenance, concatenatedHashString: accumulatedHashString.join("") },
    null,
    "\t"
  )
);

console.log(`\nProvenance Hash Save in !\n${buildDir}/_provenance.json\n`);
console.log(chalk.greenBright.bold(`${provenance} \n`));
