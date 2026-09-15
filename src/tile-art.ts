// Pixel viewports into the original, unmodified sculpted artwork.
// The generated RGB atlases include a checkerboard outside the tile silhouettes;
// rounded CSS viewports exclude it without rewriting the source images.
export interface TileFrame {
  file: string;
  rect: readonly [number, number, number, number];
}

function grid(file: string, columns: number[], rows: [number, number][], widths: number[]): TileFrame[] {
  return rows.flatMap(([y, height]) => columns.map((x, column) => ({
    file, rect: [x, y, widths[column], height] as const,
  })));
}

const wan = grid("wan", [40, 361, 683], [[76, 430], [541, 435], [1012, 437]], [300, 302, 302]);
const dots = grid("dots", [39, 361, 684], [[52, 454], [534, 453], [1015, 461]], [301, 301, 301]);
const bamboo = grid("bamboo", [30, 356, 693], [[42, 469], [525, 464], [1006, 494]], [303, 312, 303]);
const honors = grid("honors", [21, 355, 687], [[86, 447], [551, 435], [1004, 443]], [317, 315, 315]);
const flowers = grid("flowers", [26, 355, 685], [[40, 471], [530, 471], [1017, 471]], [314, 315, 315]);

// Individually corrected faces: six in two rows of three; red 1 + green 3 + 3 seven; W/M eight.
bamboo[5] = { file: "bamboo-six-corrected", rect: [62, 38, 898, 1481] };
bamboo[6] = { file: "bamboo-seven", rect: [62, 38, 898, 1481] };
bamboo[7] = { file: "bamboo-eight", rect: [62, 38, 898, 1481] };

export const SCULPTED_TILE_FRAMES: TileFrame[] = [...wan, ...dots, ...bamboo, ...honors.slice(0, 7), ...flowers.slice(0, 8)];
// The unmodified generated reference atlases are cropped by CSS into identical
// front faces. Physical thickness and perspective belong to the scene renderer.
export const TILE_FRAMES: TileFrame[] = [
  ...grid("../reference/wan", [51,375,696], [[70,400],[553,415],[1046,417]], [278,278,278]),
  ...grid("../reference/dots", [52,373,695], [[72,395],[555,396],[1041,395]], [279,279,279]),
  ...grid("../reference/bamboo", [49,373,694], [[63,408],[548,407],[1023,433]], [283,283,281]),
  ...grid("../reference/honors", [51,372,693], [[73,405],[553,405],[1034,405]], [281,281,281]).slice(0,7),
  ...grid("../reference/flowers", [52,375,696], [[72,402],[551,403],[1032,404]], [277,277,277]).slice(0,8),
];
export const BACK_FRAME = honors[7];

export function frameStyle(frame: TileFrame) {
  const [x, y, width, height] = frame.rect;
  return {
    backgroundImage: `url("/tiles/sculpted/${frame.file}.png")`,
    backgroundSize: `${1024 / width * 100}% ${1536 / height * 100}%`,
    backgroundPosition: `${x / (1024 - width) * 100}% ${y / (1536 - height) * 100}%`,
  };
}
