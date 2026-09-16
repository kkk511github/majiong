import vivid from "./tile-vivid.json";
// Shared 3D tile viewports; the legacy catalog remains available for archived studies.
export interface TileFrame {
  file: string;
  rect: readonly [number, number, number, number];
  sheet?: readonly [number, number];
}

function grid(
  file: string,
  columns: number[],
  rows: [number, number][],
  widths: number[],
): TileFrame[] {
  return rows.flatMap(([y, height]) =>
    columns.map((x, column) => ({
      file,
      rect: [x, y, widths[column], height] as const,
    })),
  );
}

const wan = grid(
  "wan",
  [40, 361, 683],
  [
    [76, 430],
    [541, 435],
    [1012, 437],
  ],
  [300, 302, 302],
);
const dots = grid(
  "dots",
  [39, 361, 684],
  [
    [52, 454],
    [534, 453],
    [1015, 461],
  ],
  [301, 301, 301],
);
const bamboo = grid(
  "bamboo",
  [30, 356, 693],
  [
    [42, 469],
    [525, 464],
    [1006, 494],
  ],
  [303, 312, 303],
);
const honors = grid(
  "honors",
  [21, 355, 687],
  [
    [86, 447],
    [551, 435],
    [1004, 443],
  ],
  [317, 315, 315],
);
const flowers = grid(
  "flowers",
  [26, 355, 685],
  [
    [40, 471],
    [530, 471],
    [1017, 471],
  ],
  [314, 315, 315],
);

// Individually corrected faces: six in two rows of three; red 1 + green 3 + 3 seven; W/M eight.
bamboo[5] = { file: "bamboo-six-corrected", rect: [62, 38, 898, 1481] };
bamboo[6] = { file: "bamboo-seven", rect: [62, 38, 898, 1481] };
bamboo[7] = { file: "bamboo-eight", rect: [62, 38, 898, 1481] };

export const SCULPTED_TILE_FRAMES: TileFrame[] = [
  ...wan,
  ...dots,
  ...bamboo,
  ...honors.slice(0, 7),
  ...flowers.slice(0, 8),
];
// The unmodified generated reference atlases are cropped by CSS into identical
// front faces. Physical thickness and perspective belong to the scene renderer.
function vividFrame(frame: typeof vivid.back): TileFrame {
  const [x, y, width, height] = frame.rect;
  const [sheetWidth, sheetHeight] = frame.sheet;
  return { file: frame.file, rect: [x, y, width, height], sheet: [sheetWidth, sheetHeight] };
}
export const TILE_FRAMES = vivid.faces.map(vividFrame);
export const BACK_FRAME = vividFrame(vivid.back);

export function frameStyle(frame: TileFrame) {
  const [x, y, width, height] = frame.rect;
  const [sheetWidth, sheetHeight] = frame.sheet ?? [1024, 1536];
  return {
    backgroundImage: `url("/tiles/sculpted/${frame.file}.png")`,
    backgroundSize: `${(sheetWidth / width) * 100}% ${(sheetHeight / height) * 100}%`,
    backgroundPosition: `${(x / (sheetWidth - width)) * 100}% ${(y / (sheetHeight - height)) * 100}%`,
  };
}
