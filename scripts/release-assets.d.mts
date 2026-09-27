export const previewOnlyAssets: string[];
export function prunePreviewAssets(output:string,project?:string):Promise<{kind:string;removed:{path:string;bytes:number}[];savedBytes:number}>;
