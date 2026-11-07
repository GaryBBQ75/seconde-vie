export const maxItemPhotos = 3;

export function itemPhotos(row) {
  return row.photos ?? (row.photo ? [row.photo] : []);
}
