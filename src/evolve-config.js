// Layers Order
export const format = {
  width: 512,
  height: 512,
  smoothing: true,
};

export const layersOrder = [
  {
    name: "Background",
    // use traitAlias if the trait was renamed in metadata
    traitAlias: "BG",
    // when true, it will look for a file with the same name
    constant: true,
    // use mappings to map only specific values for a trait_type.
    mappings: {
      clouds: "clouds", // basically forced combinations,
    },
  },
  { name: "Head" }, // randomize other layers as usual
  { name: "Eyes", constant: true },
  { name: "Shirt Accessories" },
];
