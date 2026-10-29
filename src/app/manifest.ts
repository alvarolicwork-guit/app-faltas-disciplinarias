import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Control Disciplinario — Sistema Institucional",
    short_name: "Control Disciplinario",
    description: "Registro y control de faltas disciplinarias del comando departamental.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7faf5",
    theme_color: "#243025",
    icons: [
      { src: "/icons/policia-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/policia-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/policia-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
