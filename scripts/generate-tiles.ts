import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import glyphData from "./tile-glyphs.json";

// Original, deterministic ink artwork. Brush outlines use OFL Ma Shan Zheng / Yuji Syuku.
// Legacy vector artwork; the app uses the sculpted bitmap frames in src/tile-art.ts.
type Attrs = Record<string, string | number>;
type Ink = "blue" | "red" | "green" | "gold";
const out = resolve("public/tiles");
mkdirSync(out, { recursive: true });
const tag = (name: string, a: Attrs = {}, c = "") =>
  "<" +
  name +
  Object.entries(a)
    .map(([k, v]) => " " + k + '="' + v + '"')
    .join("") +
  ">" +
  c +
  "</" +
  name +
  ">";
const path = (d: string, fill: string, extra: Attrs = {}) =>
  tag("path", { d, fill, ...extra });
const group = (c: string, a: Attrs = {}) => tag("g", a, c);
const circle = (
  cx: number,
  cy: number,
  r: number,
  fill: string,
  a: Attrs = {},
) => tag("circle", { cx, cy, r, fill, ...a });
const ellipse = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  fill: string,
  a: Attrs = {},
) => tag("ellipse", { cx, cy, rx, ry, fill, ...a });
const stroke = (d: string, color: string, width = 1, a: Attrs = {}) =>
  path(d, "none", {
    stroke: color,
    "stroke-width": width,
    "stroke-linecap": "round",
    "stroke-linejoin": "round",
    ...a,
  });
const shades = {
  blue: ["#26372e", "#14201b", "#08130d"],
  red: ["#cf352c", "#ad211d", "#8c1718"],
  green: ["#2d823c", "#175b26", "#0b3c19"],
  gold: ["#eed16c", "#bc8730", "#84551c"],
};
const paint = (ink: Ink) => "url(#" + ink + ")";
const defs = tag(
  "defs",
  {},
  [
    tag(
      "linearGradient",
      { id: "ceramic", x1: "0", x2: "1", y1: "0", y2: ".85" },
      tag("stop", { offset: "0", "stop-color": "#ffffff" }) +
        tag("stop", { offset: ".46", "stop-color": "#fffef1" }) +
        tag("stop", { offset: ".8", "stop-color": "#f2edda" }) +
        tag("stop", { offset: "1", "stop-color": "#d8d9c2" }),
    ),
    tag(
      "linearGradient",
      { id: "edge", x1: "0", x2: "0", y1: "0", y2: "1" },
      tag("stop", { offset: "0", "stop-color": "#fffff4" }) +
        tag("stop", { offset: ".8", "stop-color": "#dce2c8" }) +
        tag("stop", { offset: "1", "stop-color": "#b0baa1" }),
    ),
    tag(
      "linearGradient",
      { id: "jade", x1: "0", x2: "1", y1: "0", y2: ".2" },
      tag("stop", { offset: "0", "stop-color": "#78d9b3" }) +
        tag("stop", { offset: ".14", "stop-color": "#13a27b" }) +
        tag("stop", { offset: ".76", "stop-color": "#077451" }) +
        tag("stop", { offset: "1", "stop-color": "#024f3e" }),
    ),
    ...Object.entries(shades).map(([id, colors]) =>
      tag(
        "linearGradient",
        { id, x1: "0", x2: ".25", y1: "0", y2: "1" },
        colors
          .map((color, i) =>
            tag("stop", { offset: i / 2, "stop-color": color }),
          )
          .join(""),
      ),
    ),
    tag(
      "filter",
      {
        id: "engraving",
        x: "-10%",
        y: "-10%",
        width: "120%",
        height: "120%",
        "color-interpolation-filters": "sRGB",
      },
      tag("feOffset", { in: "SourceAlpha", dy: 0.36, result: "down" }) +
        tag("feComposite", {
          in: "SourceAlpha",
          in2: "down",
          operator: "out",
          result: "topEdge",
        }) +
        tag("feFlood", { "flood-color": "#102315", "flood-opacity": 0.45 }) +
        tag("feComposite", { in2: "topEdge", operator: "in", result: "cut" }) +
        tag("feOffset", { in: "SourceAlpha", dy: -0.4, result: "up" }) +
        tag("feComposite", {
          in: "SourceAlpha",
          in2: "up",
          operator: "out",
          result: "bottomEdge",
        }) +
        tag("feFlood", { "flood-color": "#ffffff", "flood-opacity": 0.65 }) +
        tag("feComposite", {
          in2: "bottomEdge",
          operator: "in",
          result: "glint",
        }) +
        tag(
          "feMerge",
          {},
          tag("feMergeNode", { in: "SourceGraphic" }) +
            tag("feMergeNode", { in: "cut" }) +
            tag("feMergeNode", { in: "glint" }),
        ),
    ),
  ].join(""),
);
const body = [
  tag("rect", { x: 2, y: 9, width: 60, height: 77, rx: 7, fill: "#004733" }),
  tag("rect", {
    x: 2,
    y: 7,
    width: 60,
    height: 77,
    rx: 7,
    fill: "url(#jade)",
    stroke: "#115e46",
    "stroke-width": ".65",
  }),
  stroke("M7 80Q31 83 57 79", "#43bd8e", 0.65, { opacity: ".55" }),
  tag("rect", {
    x: 2,
    y: 3,
    width: 60,
    height: 76,
    rx: 7,
    fill: "url(#edge)",
    stroke: "#b4bda6",
    "stroke-width": ".5",
  }),
  tag("rect", {
    x: 2,
    y: 1,
    width: 60,
    height: 76,
    rx: 7,
    fill: "url(#ceramic)",
    stroke: "#fafbee",
    "stroke-width": ".8",
  }),
  tag("rect", {
    x: 4.1,
    y: 3.2,
    width: 55.8,
    height: 70.5,
    rx: 5.2,
    fill: "none",
    stroke: "#ffffff",
    "stroke-width": ".7",
    opacity: ".9",
  }),
  stroke("M4 66V10Q4 3 11 3H53", "#ffffff", 1.6, { opacity: ".9" }),
  stroke("M60 13V68Q60 75 53 75H12", "#bfc8b0", 0.9, { opacity: ".7" }),
  path("M7 8Q9 5 15 5H52Q57 5 58 9V13Q33 8 7 16Z", "#ffffff", {
    opacity: ".26",
  }),
].join("");

function glyph(
  char: string,
  x: number,
  y: number,
  width: number,
  height: number,
  ink: Ink,
) {
  const { path: d, bounds: b } = glyphData[char as keyof typeof glyphData];
  const s = Math.min(width / (b[2] - b[0]), height / (b[3] - b[1]));
  const dx = x + (width - (b[2] - b[0]) * s) / 2 - b[0] * s;
  const dy = y + (height - (b[3] - b[1]) * s) / 2 + b[3] * s;
  const transform =
    "translate(" + dx + " " + dy + ") scale(" + s + " " + -s + ")";
  return group(
    path(d, "#fff", {
      transform: "translate(0 -15)",
      stroke: "#fff",
      "stroke-width": 9,
      opacity: ".9",
    }) +
      path(d, paint(ink), {
        stroke: shades[ink][2],
        "stroke-width": 12,
        "stroke-linejoin": "round",
      }),
    { transform },
  );
}
function pip(x: number, y: number, r: number, ink: Ink) {
  return group(
    circle(0, 0.45, r + 0.25, "#fff") +
      circle(0, 0, r, paint(ink), {
        stroke: shades[ink][2],
        "stroke-width": ".45",
      }) +
      circle(0, 0, r * 0.7, "#fff8de", {
        stroke: "#f8f5dd",
        "stroke-width": ".4",
      }) +
      circle(0, 0, r * 0.48, "none", {
        stroke: shades[ink][1],
        "stroke-width": ".65",
      }) +
      circle(0, 0, r * 0.22, paint(ink)) +
      stroke(
        "M" +
          -r * 0.8 +
          " -.8A" +
          r * 0.82 +
          " " +
          r * 0.82 +
          " 0 0 1-1 -" +
          r * 0.8,
        "#ffffff",
        0.5,
        { opacity: ".6" },
      ),
    { transform: "translate(" + x + " " + y + ")", "data-pip": ink },
  );
}
const numberPositions: Record<number, number[][]> = {
  2: [
    [32, 23],
    [32, 55],
  ],
  3: [
    [18, 19],
    [32, 39],
    [46, 59],
  ],
  4: [
    [19, 22],
    [45, 22],
    [19, 56],
    [45, 56],
  ],
  5: [
    [18, 20],
    [46, 20],
    [18, 58],
    [46, 58],
    [32, 39],
  ],
  6: [
    [19, 19],
    [45, 19],
    [19, 39],
    [45, 39],
    [19, 59],
    [45, 59],
  ],
  7: [
    [17, 13],
    [32, 22],
    [47, 31],
    [20, 48],
    [44, 48],
    [20, 64],
    [44, 64],
  ],
  8: [15, 31, 47, 63].flatMap((y) => [
    [20, y],
    [44, y],
  ]),
  9: [18, 39, 60].flatMap((y) => [17, 32, 47].map((x) => [x, y])),
};
function circles(n: number) {
  if (n === 1)
    return group(
      circle(0, 0, 24, paint("green")) +
        circle(0, 0, 21.7, "#faf9eb") +
        circle(0, 0, 19.9, paint("green")) +
        circle(0, 0, 17.6, "#faf9eb") +
        circle(0, 0, 15.8, paint("green")) +
        Array.from({ length: 20 }, (_, i) =>
          stroke("M0-13.6V-11.2", "#f7f8e7", 1.1, {
            transform: "rotate(" + i * 18 + ")",
          }),
        ).join("") +
        circle(0, 0, 9.7, "#faf9eb") +
        circle(0, 0, 8.1, paint("red")) +
        circle(0, 0, 5.8, "none", { stroke: "#fff7e5", "stroke-width": ".9" }) +
        circle(0, 0, 3.3, paint("red")),
      { transform: "translate(32 39)", "data-pip": "medallion" },
    );
  const r =
    n === 2
      ? 10.5
      : n < 5
        ? 9.1
        : n === 5
          ? 8.3
          : n === 9
            ? 7.2
            : n === 7
              ? 7.5
              : 8;
  return numberPositions[n]
    .map(([x, y], i) => {
      let ink: Ink = "blue";
      if (n === 2) ink = "green";
      if (n === 3) ink = (["green", "red", "blue"] as Ink[])[i];
      if (n === 5 && i === 4) ink = "red";
      if (n === 6 || n === 7) ink = i < n - 4 ? "green" : "red";
      if (n === 9) ink = (["blue", "red", "green"] as Ink[])[Math.floor(i / 3)];
      return pip(x, y, r, ink);
    })
    .join("");
}
function stem(x: number, y: number, h: number, ink: Ink = "green", angle = 0) {
  return group(
    group(
      path(
        "M0-10C-4.7-10-5.3-5.6-2.7-3.8C-4.7-1.7-4.7 1.7-2.7 3.8C-5.3 5.6-4.7 10 0 10C4.7 10 5.3 5.6 2.7 3.8C4.7 1.7 4.7-1.7 2.7-3.8C5.3-5.6 4.7-10 0-10Z",
        paint(ink),
        { stroke: shades[ink][2], "stroke-width": ".4" },
      ) +
        stroke(
          "M-.7-7.5Q-2-5.7-.5-3.4Q-2 0-.5 3.5Q-2 5.8-.7 7.5",
          "#f5f4df",
          0.85,
        ) +
        stroke("M-2.8-3.8H2.8M-2.8 3.8H2.8", shades[ink][2], 0.5),
      { transform: "scale(1 " + h / 20 + ")" },
    ),
    {
      transform: "translate(" + x + " " + y + ") rotate(" + angle + ")",
      "data-stem": ink,
    },
  );
}
const bird = [
  path(
    "M28 40C22 54 14 64 8 68C18 67 25 57 31 48C27 60 22 69 17 72C30 67 35 54 37 42Z",
    paint("blue"),
    { stroke: "#102f61", "stroke-width": ".6" },
  ),
  stroke("M28 46Q21 61 12 67M32 48Q28 63 21 69", "#5ba9c7", 0.9),
  path(
    "M23 38C13 35 12 25 19 20C19 12 26 7 33 11C39 7 46 10 46 17L53 20 46 23C49 33 43 46 32 48C27 47 24 42 23 38Z",
    paint("green"),
    { stroke: "#005039", "stroke-width": ".75" },
  ),
  path(
    "M32 23C42 21 47 25 44 34C42 43 36 48 30 46C35 39 36 33 32 23Z",
    "#f8e5a3",
    { stroke: "#cfb973", "stroke-width": ".4" },
  ),
  path(
    "M26 24C18 28 17 34 24 40C16 39 10 34 12 29C9 24 10 17 7 12C19 14 27 18 29 23Z",
    paint("red"),
    { stroke: "#9d211e", "stroke-width": ".65" },
  ),
  [
    "M12 17Q23 21 25 25",
    "M13 22Q21 25 23 29",
    "M13 28Q17 30 21 32",
    "M17 35 22 36",
  ]
    .map((d) => stroke(d, "#f5c886", 0.8))
    .join(""),
  path("M28 23C16 33 23 44 31 40C36 37 35 28 28 23Z", paint("green"), {
    stroke: "#035c43",
    "stroke-width": ".65",
  }),
  ["M27 28Q21 34 27 39", "M29 29Q25 35 30 37", "M24 30 23 35"]
    .map((d) => stroke(d, "#85ca85", 0.8))
    .join(""),
  path("M31 12Q37 8 43 14Q39 12 36 16Z", "#247e9e"),
  ellipse(41, 17.5, 2.3, 2.6, "#fff4c7"),
  circle(41.4, 17.4, 1.12, "#13293a"),
  circle(41.7, 17, 0.38, "#fff"),
  path("M46 19 53 20 46 22Z", "#dd8432"),
  stroke("M35 46 34 56 38 59M31 47 29 55 33 58", "#b75324", 1.6),
  stroke("M15 66Q36 59 52 66M43 64 48 59", "#286a46", 1.7),
  path("M46 61Q50 54 55 57Q51 62 46 61Z", paint("green")),
].join("");
function bamboo(n: number) {
  if (n === 1) return group(bird, { "data-stem": "bird" });
  if (n === 2) return stem(32, 22, 24) + stem(32, 56, 24);
  if (n === 3) return stem(32, 21, 23) + stem(19, 55, 25) + stem(45, 55, 25);
  if (n === 4)
    return [21, 56]
      .flatMap((y) => [20, 44].map((x) => stem(x, y, 24)))
      .join("");
  if (n === 5)
    return (
      [19, 60].flatMap((y) => [18, 46].map((x) => stem(x, y, 18))).join("") +
      stem(32, 39, 23, "red")
    );
  if (n === 6)
    return [21, 56]
      .flatMap((y) => [17, 32, 47].map((x) => stem(x, y, 24)))
      .join("");
  if (n === 7)
    return (
      stem(32, 18, 17, "red") +
      [41, 63].flatMap((y) => [18, 32, 46].map((x) => stem(x, y, 16))).join("")
    );
  if (n === 8)
    return [23, 55]
      .flatMap((y, row) =>
        [15, 26, 38, 49].map((x, i) =>
          stem(x, y, 20, "green", (i % 2 ? 24 : -24) * (row ? -1 : 1)),
        ),
      )
      .join("");
  return [17, 39, 61]
    .flatMap((y, row) =>
      [17, 32, 47].map((x) => stem(x, y, 16, row === 1 ? "red" : "green")),
    )
    .join("");
}
function blossom(x: number, y: number, r: number, color: string, petals = 5) {
  return group(
    Array.from({ length: petals }, (_, i) =>
      ellipse(0, -r * 0.48, r * 0.46, r * 0.62, color, {
        stroke: color === "#d64445" ? "#a42d32" : "#ba6471",
        "stroke-width": ".3",
        transform: "rotate(" + (i * 360) / petals + ")",
      }),
    ).join("") +
      circle(0, 0, r * 0.24, "#efbd52") +
      Array.from({ length: 5 }, (_, i) =>
        circle(0, -r * 0.24, 0.35, "#fff2a9", {
          transform: "rotate(" + i * 72 + ")",
        }),
      ).join(""),
    { transform: "translate(" + x + " " + y + ")" },
  );
}
function leaf(
  x: number,
  y: number,
  size: number,
  rotation: number,
  color = "#147d56",
) {
  return group(
    path(
      "M0 0Q" +
        -size * 0.75 +
        " " +
        -size * 0.55 +
        " 0 " +
        -size +
        "Q" +
        size * 0.5 +
        " " +
        -size * 0.4 +
        " 0 0Z",
      color,
    ) + stroke("M0-.5V" + -size * 0.82, "#b0cd80", 0.4),
    { transform: "translate(" + x + " " + y + ") rotate(" + rotation + ")" },
  );
}
function flowerArt(index: number) {
  const base = stroke("M18 67Q32 69 48 67", "#b3aa80", 0.6);
  switch (index) {
    case 0:
      return (
        base +
        stroke("M23 65Q29 48 39 28M29 50 18 37M34 40 47 38", "#876141", 2) +
        leaf(27, 52, 10, -65) +
        leaf(36, 41, 9, 65) +
        blossom(39, 27, 8, "#eaa0aa") +
        blossom(19, 37, 6, "#e98796") +
        blossom(46, 39, 6, "#f2b3b8") +
        circle(29, 29, 2, "#dd7683")
      );
    case 1:
      return (
        base +
        stroke("M32 65Q37 48 32 38M24 64Q19 59 19 52", "#438746", 1.2) +
        ellipse(22, 59, 12, 4.5, "#4d9f6e", {
          transform: "rotate(-12 22 59)",
          stroke: "#2e7c55",
          "stroke-width": ".6",
        }) +
        stroke("M12 60 30 58M22 59 23 55", "#d4dba0", 0.6) +
        path(
          "M32 48C15 45 16 31 16 31Q26 32 32 42Q37 30 48 31C48 43 41 49 32 48Z",
          "#e6a0ae",
          { stroke: "#bc557a", "stroke-width": ".6" },
        ) +
        path(
          "M32 46C21 39 23 29 27 25Q31 28 32 35Q33 28 38 25C42 34 41 42 32 46Z",
          "#f0bfca",
          { stroke: "#c57791", "stroke-width": ".6" },
        ) +
        path("M32 44Q26 34 32 21Q38 34 32 44Z", "#f7dae0", {
          stroke: "#bd7397",
          "stroke-width": ".5",
        }) +
        circle(33, 46, 2, "#e5bc58")
      );
    case 2:
      return (
        base +
        stroke("M24 66Q29 48 41 27M29 52 17 41M35 40 46 46", "#8c6040", 1.7) +
        [
          [39, 30, 1],
          [18, 41, 0.8],
          [46, 45, 0.75],
        ]
          .map(([x, y, s]) =>
            group(
              path(
                "M0 10-8 4-5 0-9-5-2-3 0-12 4-4 10-6 7 1 12 3 4 8Z",
                paint("gold"),
                { stroke: "#ac6426", "stroke-width": ".65" },
              ) + stroke("M0 10 1-8M1 4-6-3M1 4 8-2", "#c3642b", 0.8),
              { transform: "translate(" + x + " " + y + ") scale(" + s + ")" },
            ),
          )
          .join("") +
        leaf(27, 59, 10, -45, "#c37230")
      );
    case 3:
      return (
        base +
        stroke("M26 65Q33 46 35 27M29 53 45 44M32 40 20 33", "#796044", 2.2) +
        [
          [35, 28],
          [20, 34],
          [44, 44],
          [30, 49],
        ]
          .map(([x, y]) =>
            group(
              Array.from({ length: 9 }, (_, i) =>
                stroke(
                  "M0 5 " + (i - 4) * 2.1 + " " + (-6 + Math.abs(i - 4)),
                  "#116f51",
                  0.85,
                ),
              ).join("") + stroke("M-6-3Q0-8 6-3", "#a9cbc0", 2.1),
              { transform: "translate(" + x + " " + y + ")" },
            ),
          )
          .join("") +
        circle(45, 55, 2.3, "#d94d3b") +
        circle(41, 58, 1.7, "#c12d29") +
        stroke("M18 24h7m-3.5-3.5v7m-2.5-6 5 5m0-5-5 5", "#80b1b3", 0.7)
      );
    case 4:
      return (
        base +
        stroke("M22 66Q33 49 37 30M29 53 16 42M35 38 49 31", "#6f583e", 2.5) +
        stroke("M23 62 30 51M36 39 38 32", "#bb9b73", 0.7) +
        blossom(36, 28, 7.4, "#d64445") +
        blossom(16, 42, 6, "#d64445") +
        blossom(46, 34, 6.3, "#df5157") +
        blossom(29, 52, 4.7, "#d64445") +
        circle(46, 23, 2.4, "#c4303f")
      );
    case 5:
      return (
        base +
        path(
          "M30 67Q7 49 17 33Q14 54 30 67M30 67Q48 44 43 32Q51 49 30 67M29 67Q19 50 28 39Q22 54 29 67M29 67Q39 54 50 51Q40 61 29 67Z",
          paint("green"),
        ) +
        stroke("M30 64Q35 43 34 26M33 38 45 34", "#44764d", 1) +
        group(
          path(
            "M0 0Q-13-9-8-14Q-1-11 0 0M0 0Q2-16 7-14Q10-7 0 0M0 0Q14-4 13 2Q6 5 0 0M0 0Q4 12-1 10Q-6 7 0 0M0 0Q-11 7-11 1Q-8-3 0 0Z",
            "#8970a3",
            { stroke: "#67517f", "stroke-width": ".5" },
          ) + circle(0, 0, 1.8, "#ecc55f"),
          { transform: "translate(34 29) scale(.72)" },
        ) +
        blossom(44, 35, 4, "#b295bf", 3)
      );
    case 6:
      return (
        base +
        stem(29, 49, 38, "green", 6) +
        stem(42, 52, 30, "green", -6) +
        stroke("M28 36 18 27M29 49 17 45M42 42 52 35", "#2e7446", 1) +
        leaf(25, 34, 14, -48) +
        leaf(22, 31, 12, 15) +
        leaf(31, 30, 13, 35) +
        leaf(28, 47, 14, -80) +
        leaf(23, 47, 11, -130) +
        leaf(44, 42, 13, 60) +
        leaf(48, 38, 9, 10)
      );
    default:
      return (
        base +
        stroke("M30 65Q34 47 36 36M32 54 20 46", "#4f7c49", 1.7) +
        leaf(31, 57, 15, -58) +
        leaf(32, 60, 14, 67) +
        leaf(24, 49, 11, -42) +
        group(
          Array.from({ length: 18 }, (_, i) =>
            ellipse(0, -7, 1.7, 7.2, i % 2 ? "#e8bc44" : "#f3d976", {
              stroke: "#b4872c",
              "stroke-width": ".4",
              transform: "rotate(" + i * 20 + ")",
            }),
          ).join("") +
            circle(0, 0, 4.5, "#c99431") +
            circle(-0.7, -0.7, 2.6, "#ecca56"),
          { transform: "translate(37 33)" },
        ) +
        blossom(19, 46, 5, "#e9b94a", 8)
      );
  }
}
const numerals = Array.from("一二三四五六七八九");
const honors = Array.from("東南西北中發");
const flowers = Array.from("春夏秋冬梅蘭竹菊");
function face(k: number) {
  if (k < 9)
    return (
      glyph(numerals[k], 10, 8, 44, 26, "blue") +
      glyph("萬", 9, 36, 46, 37, "red")
    );
  if (k < 18) return circles(k - 8);
  if (k < 27) return bamboo(k - 17);
  if (k < 33)
    return glyph(
      honors[k - 27],
      8,
      12,
      48,
      57,
      k === 31 ? "red" : k === 32 ? "green" : "blue",
    );
  if (k === 33)
    return (
      tag("rect", {
        x: 13,
        y: 14,
        width: 38,
        height: 51,
        rx: 2,
        fill: "none",
        stroke: "#143d76",
        "stroke-width": 3.3,
      }) +
      tag("rect", {
        x: 17,
        y: 18,
        width: 30,
        height: 43,
        rx: 0.8,
        fill: "none",
        stroke: "#3673a5",
        "stroke-width": 1.1,
      }) +
      stroke("M13 24h5v-6m33 37h-5v6M24 14v5h-6m22 46v-5h6", "#183e79", 1.4) +
      stroke("M11 59V18Q11 12 17 12H47", "#fff", 0.75) +
      stroke("M21 18h4m14 43h4", "#f4d798", 0.8)
    );
  const index = k - 34;
  return (
    glyph(flowers[index], 8, 10, 13, 15, index < 4 ? "red" : "blue") +
    flowerArt(index) +
    glyph(numerals[index % 4], 48, 11, 7, 8, index < 4 ? "red" : "blue")
  );
}
const svg = (art: string, withBody = true) =>
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="352" viewBox="0 0 64 88">' +
  defs +
  (withBody ? body : "") +
  group(art, { filter: "url(#engraving)" }) +
  "</svg>";
const all = Array.from({ length: 42 }, (_, k) => svg(face(k), false));
for (let k = 0; k < all.length; k++)
  writeFileSync(resolve(out, k + ".svg"), all[k]);
const back = svg(
  tag("rect", {
    x: 5.5,
    y: 5,
    width: 53,
    height: 67,
    rx: 4.5,
    fill: "url(#jade)",
    stroke: "#0b7256",
    "stroke-width": ".6",
  }) +
    tag("rect", {
      x: 8,
      y: 7.5,
      width: 48,
      height: 62,
      rx: 3.6,
      fill: "none",
      stroke: "#ade4b7",
      "stroke-width": ".5",
    }) +
    path("M32 19 47 38 32 57 17 38Z", "#087855", {
      stroke: "#76c497",
      "stroke-width": ".7",
    }) +
    stroke("M32 23 43 38 32 53 21 38Z", "#c1e6aa", 0.55) +
    stroke(
      "M23 39Q24 33 29 36Q28 28 34 30Q40 30 38 37Q45 35 43 41H23M22 44h20",
      "#9fdbad",
      1.1,
    ) +
    stroke("M13 14h9m-9 0v8m29-8h9v8M13 55v8h9m29-8v8h-9", "#8ed7a8", 0.65),
);
writeFileSync(resolve(out, "back.svg"), back);
writeFileSync(
  resolve(out, "back-side.svg"),
  back
    .replace(
      'viewBox="0 0 64 88"',
      'viewBox="0 0 88 64" preserveAspectRatio="none"',
    )
    .replace("</defs>", '</defs><g transform="translate(88 0) rotate(90)">')
    .replace("</svg>", "</g></svg>"),
);
const names = [
  ...numerals.map((n) => n + "万"),
  ...numerals.map((n) => n + "筒"),
  ...numerals.map((n) => n + "条"),
  "东风",
  "南风",
  "西风",
  "北风",
  "红中",
  "发财",
  "白板",
  ...flowers,
];
writeFileSync(
  resolve(out, "manifest.json"),
  JSON.stringify(
    {
      version: 1,
      viewBox: "0 0 64 88",
      tiles: names.map((name, kind) => ({ kind, name, file: kind + ".svg" })),
      back: "back.svg",
    },
    null,
    2,
  ),
);
console.log("Created all 42 unique faces and the jade back in public/tiles.");
const rows = [
  { title: "万子", note: "粗笔数目 · 朱红万字", start: 0, end: 9 },
  { title: "筒子", note: "大筒花 · 清晰分色", start: 9, end: 18 },
  { title: "条子", note: "饱满竹节 · 传统排布", start: 18, end: 27 },
  { title: "字牌", note: "四方风位 · 中发白", start: 27, end: 34 },
  { title: "花牌", note: "四时花信 · 梅兰竹菊", start: 34, end: 42 },
];
const data = (source: string) =>
  "data:image/svg+xml;base64," + Buffer.from(source).toString("base64");
const card = (name: string, source: string, isBack = false) =>
  '<button class="swatch" data-back="' +
  isBack +
  '" aria-label="放大' +
  name +
  '"><span class="tile-art">' +
  (isBack ? "" : '<span class="tile-material"></span>') +
  '<img class="tile-ink" src="' +
  data(source) +
  '" alt="' +
  name +
  '" draggable="false"></span><span class="label">' +
  name +
  "</span></button>";
const catalog = readFileSync(resolve("scripts/tile-catalog.html"), "utf8")
  .replaceAll(
    "{{BODY}}",
    "data:image/png;base64," +
      readFileSync(resolve(out, "tile-material.png")).toString("base64"),
  )
  .replaceAll(
    "{{MASK}}",
    data(readFileSync(resolve(out, "tile-mask.svg"), "utf8")),
  )
  .replace("{{BACK}}", card("翡翠牌背", back, true))
  .replace(
    "{{CARDS}}",
    rows
      .map(
        (row) =>
          '<section><div class="section-head"><h2>' +
          row.title +
          "</h2><span>" +
          row.note +
          '</span></div><div class="cards">' +
          all
            .slice(row.start, row.end)
            .map((source, i) => card(names[row.start + i], source))
            .join("") +
          "</div></section>",
      )
      .join(""),
  );
writeFileSync(resolve("public/tile-catalog.html"), catalog);
writeFileSync(resolve("../麻将牌面设计.html"), catalog);
