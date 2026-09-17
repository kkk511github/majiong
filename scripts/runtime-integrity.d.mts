export function resourceDigest(root: string): Promise<{sha256:string;files:number;bytes:number}>;

export function sourceDigest(project:string):Promise<string>;
