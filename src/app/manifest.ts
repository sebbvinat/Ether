import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ether — Live Charts",
    short_name: "Ether",
    description:
      "Charts en vivo de crypto e índices. Alternativa open-source a TradingView.",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#131722",
    theme_color: "#131722",
    icons: [
      {
        src: "/icon",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon",
        sizes: "180x180",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
