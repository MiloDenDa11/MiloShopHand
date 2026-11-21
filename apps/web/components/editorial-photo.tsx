import Image from "next/image";
import { editorialPhotos, type EditorialPhotoId } from "../content/editorial-photos";

export function EditorialPhoto({ photo, className = "", sizes = "(max-width: 760px) 92vw, 40vw", eager = false }: {
  photo: EditorialPhotoId; className?: string; sizes?: string; eager?: boolean;
}) {
  const asset = editorialPhotos[photo];
  return <span className={`milo-editorial-photo ${className}`} data-editorial-photo={photo}>
    <Image src={asset.src} alt={asset.alt} fill sizes={sizes} loading={eager ? "eager" : "lazy"} style={{ objectFit: "cover", objectPosition: asset.position }} />
  </span>;
}
