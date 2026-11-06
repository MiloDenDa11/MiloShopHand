import localFont from "next/font/local";

// Local Latin/Vietnamese delivery subsets retain combining marks and all weights.
export const bodyFont = localFont({
  src: "../public/fonts/latin-vietnamese/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-milo-body",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});
export const displayFont = localFont({
  src: [
    { path: "../public/fonts/latin-vietnamese/Lora-Variable.woff2", weight: "400 700", style: "normal" },
    { path: "../public/fonts/latin-vietnamese/Lora-VariableItalic.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-milo-display",
  display: "swap",
  fallback: ["Georgia", "serif"],
});
