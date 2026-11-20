import {photoSpinFor,type PhotoSpin} from "./photo-spin";

export type DisplaySpin = PhotoSpin;

// Rotate only the reviewed native image set for the selected colour.
export function displaySpinFor(product:any,colorHex?:string):DisplaySpin|null {
  return photoSpinFor(product,colorHex);
}
