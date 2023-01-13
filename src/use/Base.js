import fs from "fs";
import path from "path";

export default {
  /**
   * Create or recreate the build dir and child directories.
   * @param {Path} buildDir the partent _build_ directory path
   */
  buildSetup(buildDir) {
    if (fs.existsSync(buildDir)) {
      fs.rmdirSync(buildDir, { recursive: true });
    }
    fs.mkdirSync(buildDir);
    fs.mkdirSync(path.join(buildDir, "/json"));
    fs.mkdirSync(path.join(buildDir, "/images"));
  },
};
