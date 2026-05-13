import { ImageResponse } from "next/og";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(135deg, #131722 0%, #1e222d 60%, #2962ff 200%)",
          color: "#2962ff",
          fontSize: 320,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
          letterSpacing: -16,
          borderRadius: 96,
        }}
      >
        ⚡
      </div>
    ),
    size,
  );
}
