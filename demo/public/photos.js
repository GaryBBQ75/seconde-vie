export const maxItemPhotos = 6;

export function itemPhotos(row) {
  return row.photos ?? (row.photo ? [row.photo] : []);
}
