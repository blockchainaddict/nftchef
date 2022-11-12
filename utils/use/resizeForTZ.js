/**
 * This script helps to resize your images in the
 * `build/images` folder for the `displayUri` and
 * `thumbnailUri` in Tezos metadata.
 */

import sharp from "sharp";
import fs from "fs";
import path from "path";
import chalk from 'chalk';
import tezosConfig from '../../src/Tezos/tezos_config.js'

const isLocal = typeof process.pkg === "undefined";
const basePath = isLocal ? process.cwd() : path.dirname(process.execPath);
const imagesDir = `${basePath}/build/images`;

const resizeImagePath = {
  displayUri: path.join(basePath, "build/tezos/displayUri/"),
  thumbnailUri: path.join(basePath, "build/tezos/thumbnailUri/"),
};

function getAllImages(dir) {
  if (!fs.existsSync(imagesDir)) {
    console.log(chalk.yellowBright(`Images folder doesn't exist.`));
    return;
  }

  const images = fs
    .readdirSync(imagesDir)
    .filter((item) => {
      let extension = path.extname(`${dir}${item}`);
      if (extension == ".png" || extension == ".jpg") {
        return item;
      }
    })
    .map((i) => ({
      filename: i,
      path: `${dir}/${i}`,
    }));

  return images;
}

async function renderResizedImages(images, path, sizeW, sizeH) {
  /**
   * images: A list of images.
   * path: Path to render the resized images.
   * sizeH: Height of resized images.
   * sizeW: Width of resized images.
   */
  if (!fs.existsSync(path)) {
    console.log(`Images folder doesn't exist.`);
    return;
  }
  if (!path.endsWith("/")) {
    path += `/`;
  }

  for await (const image of images){
  // images.forEach(async (image) => {
    const newPath = `${path}${image.filename}`;
    await sharp(image.path)
      .resize(sizeW, sizeH)
      .toFile(newPath, (err, info) => {
        if (!err) {
          console.log(`Rendered ${newPath}.`);
        } else {
          console.error(chalk.yellow(`Got error ${err}`));
        }
      });
  }
  
}

const createPath = (path) => {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
    return path;
  } else {
    console.log(`${path} already exists.`);
  }
};
console.log(tezosConfig.size);

async function transformForTez(images) {
  // Converting for the `displayUri`.
  createPath(resizeImagePath.displayUri);
  console.log(chalk.bgGreen("Display", resizeImagePath.displayUri),'\n');
  await renderResizedImages(
    images,
    resizeImagePath.displayUri,
    tezosConfig.size.displayUri.width,
    tezosConfig.size.displayUri.height
  );

  createPath(resizeImagePath.thumbnailUri);

  console.log(chalk.bgGreen("Thumbnail", resizeImagePath.thumbnailUri),'\n');
  await renderResizedImages(
    images,
    resizeImagePath.thumbnailUri,
    tezosConfig.size.thumbnailUri.width,
    tezosConfig.size.thumbnailUri.height
  );
}

const images = getAllImages(imagesDir);
// console.log(`Images list`);
// console.table(images);
(async () => {
  await transformForTez(images)
  // console.log(chalk.bgCyanBright(`\nDone!`));
})();