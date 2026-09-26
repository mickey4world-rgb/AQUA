export type ThemeParkKey = "tdl" | "tds" | "usj";
export type ThemeResortTab = "disney" | "usj";

export function isDisneyParkKey(park: string): park is "tdl" | "tds" {
  return park === "tdl" || park === "tds";
}

export function isUsjParkKey(park: string): park is "usj" {
  return park === "usj";
}
