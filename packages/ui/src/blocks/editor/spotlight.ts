/** Focus mode's spotlight preference (dims everything but the paragraph being written), per browser. */
export const SPOTLIGHT_KEY = "cloudhal.editor.spotlight";
export const readSpotlight = () => {
  try {
    return globalThis.localStorage?.getItem(SPOTLIGHT_KEY) === "1";
  } catch {
    return false;
  }
};
export const writeSpotlight = (on: boolean) => {
  try {
    globalThis.localStorage?.setItem(SPOTLIGHT_KEY, on ? "1" : "0");
  } catch {
    // private windows and blocked storage: the choice lasts until the page closes
  }
};
