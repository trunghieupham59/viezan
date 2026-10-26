/**
 * Search folding shared by app filters: no diacritics, `đ` → `d`, lower case,
 * so "tieng nhat" finds "Tiếng Nhật".
 */
export const foldSearchText = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/đ/gi, 'd').toLowerCase()
