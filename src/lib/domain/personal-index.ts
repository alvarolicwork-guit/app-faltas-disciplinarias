import { normalizePersonalSearch } from "./personal-search";

/** One to three character grams preserve arbitrary substring matching.
 * Final verification still uses matchesPersonalSearch for every term. */
export function personalIndex(row: Record<string, unknown>) {
  const searchText = [row.ci,row.nombreCompleto,row.nombres,row.apellidos,row.grado].map(normalizePersonalSearch).join(" ");
  const grams = new Set<string>();
  for (let size=1;size<=3;size++) for (let i=0;i+size<=searchText.length;i++) grams.add(searchText.slice(i,i+size));
  return { searchVersion: 1, searchName: normalizePersonalSearch(row.nombreCompleto), searchGrams: [...grams] };
}
