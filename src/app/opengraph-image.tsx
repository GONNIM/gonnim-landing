import { ImageResponse } from "next/og";

export const alt =
  "gonnim.dev · Hong Haeyeon · 22 years full-stack · AI/RAG";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px 96px",
          background: "linear-gradient(135deg, #0ea5e9 0%, #6366f1 100%)",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{ fontSize: 30, fontWeight: 600, opacity: 0.85, letterSpacing: 2 }}
          >
            GONNIM.DEV
          </div>
          <div
            style={{
              fontSize: 84,
              fontWeight: 900,
              lineHeight: 1.05,
              letterSpacing: -1,
              marginTop: 8,
            }}
          >
            Hong Haeyeon
          </div>
          <div
            style={{
              fontSize: 44,
              fontWeight: 700,
              opacity: 0.95,
              lineHeight: 1.15,
              marginTop: 4,
            }}
          >
            22 years · Full-stack · AI / RAG
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              display: "flex",
              gap: 24,
              fontSize: 32,
              fontWeight: 700,
              flexWrap: "wrap",
            }}
          >
            <span>KRW 80B saved</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>20,000 stores</span>
            <span style={{ opacity: 0.5 }}>·</span>
            <span>+25% AI accuracy</span>
          </div>
          <div
            style={{
              fontSize: 22,
              opacity: 0.8,
              lineHeight: 1.4,
              maxWidth: 900,
            }}
          >
            Building local AI where your data never leaves the company.
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
