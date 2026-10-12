// The word bank as it was when the app was built. Used until (or instead of)
// the newest published copy, see loadPublishedContent in ./content.js.
// Tests swap this module for ./bundledContent.node.js (see jest.config.js).
import index from "../../content/index.json";
import languages from "../../content/languages.json";

const packFiles = import.meta.glob("../../content/packs/*.json", { eager: true, import: "default" });

export default {
  index,
  languages,
  packs: Object.values(packFiles),
};
