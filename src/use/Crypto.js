import keccak256 from "keccak256";

export default {
  /**
   * Given some input, creates a sha256 hash.
   * @param {Object} input
   */
  hash(input) {
    const hashable = typeof input === "string" ? JSON.stringify(input) : input;
    return keccak256(hashable).toString("hex");
  },
};
