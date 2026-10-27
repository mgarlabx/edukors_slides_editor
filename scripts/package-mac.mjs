// Kept for the existing commands: same as scripts/package.mjs on macOS.
if(process.platform!=='darwin')throw Error('package-mac must run on macOS; use scripts/package.mjs.');
await import('./package.mjs');
