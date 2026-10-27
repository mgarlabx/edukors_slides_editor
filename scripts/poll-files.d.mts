export const pollSource:string;
export function ignored(name:string):boolean;
export function pollFiles(dir:string,base?:string):Promise<string[]>;
export function pollDiff(source:string,target:string):Promise<{file:string;state:'missing'|'different'|'extra'}[]>;
