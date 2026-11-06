import localFont from "next/font/local";

// Complete upstream files include Vietnamese. Italics use a real italic face.
export const bodyFont = localFont({
  src: "../public/fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  variable: "--font-milo-body",
  display: "swap",
  fallback: ["Arial", "sans-serif"],
});
export const displayFont = localFont({
  src: [
    { path: "../public/fonts/Lora-Variable.woff2", weight: "400 700", style: "normal" },
    { path: "../public/fonts/Lora-VariableItalic.woff2", weight: "400 700", style: "italic" },
  ],
  variable: "--font-milo-display",
  display: "swap",
  fallback: ["Georgia", "serif"],
});
