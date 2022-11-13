import {
  extraAttributes,
  description,
  extraMetadata,
  baseUri,
  outputJPEG,
  hashImages,
} from "../../config.js";

export default {
  attributesList: [],
  metadataList: [],
  addAttributes(_element) {
    let selectedElement = _element.layer;
    const layerAttributes = {
      trait_type: _element.layer.trait,
      value: selectedElement.traitValue,
      ...(_element.layer.display_type !== undefined && {
        display_type: _element.layer.display_type,
      }),
    };
    if (
      this.attributesList.some(
        (attr) => attr.trait_type === layerAttributes.trait_type
      )
    ) {
      return;
    }
    this.attributesList.push(layerAttributes);
  },

  addMetadata(_dna, _edition, _prefixData) {
    let dateTime = Date.now();
    const { _prefix, _offset, _imageHash } = _prefixData;

    const combinedAttrs = [...this.attributesList, ...extraAttributes()];
    const cleanedAttrs = combinedAttrs.reduce((acc, current) => {
      const x = acc.find((item) => item.trait_type === current.trait_type);
      if (!x) {
        return acc.concat([current]);
      } else {
        return acc;
      }
    }, []);

    let tempMetadata = {
      name: `${_prefix ? _prefix + " " : ""}#${_edition - _offset}`,
      description: description,
      image: `${baseUri}/${_edition}${outputJPEG ? ".jpg" : ".png"}`,
      ...(hashImages === true && { imageHash: _imageHash }),
      edition: _edition,
      date: dateTime,
      ...extraMetadata,
      attributes: cleanedAttrs,
      compiler: "HashLips Art Engine - NFTChef fork",
    };
    this.metadataList.push(tempMetadata);
    this.attributesList = [];
    return tempMetadata;
  },
};
