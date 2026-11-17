export function readProfileSlots(pages) {
 const profile = {};
 for (const page of pages) {
  for (const field of page.fields ?? []) {
   const key = String(field.fieldName ?? '').replace(/^profile\./,'');
   if (['surname','names','identity','birth','email','mobile','height','mass'].includes(key) && field.fieldValue) profile[key] = String(field.fieldValue);
  }
 }
 return profile;
}
