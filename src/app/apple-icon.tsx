import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
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
          fontSize: 110,
          fontWeight: 700,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        ⚡
      </div>
    ),
    size,
  );
}
