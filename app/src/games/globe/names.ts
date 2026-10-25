/**
 * The key a typed country name is compared by: case, accents, apostrophe
 * style, hyphens and spacing never decide a match, so "cote d'ivoire",
 * "Côte d’Ivoire" and "COTE D IVOIRE" are the same guess. The country
 * generator checks its names and aliases with the same key, so no alias can
 * collide with another country once folded.
 */
export function foldCountryName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[-‐-―]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
