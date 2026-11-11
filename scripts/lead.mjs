import { build } from 'esbuild';
await build({ entryPoints: ['src/app/core/tools/router-nb.ts'], bundle: true, format: 'esm', outfile: '/tmp/nb-lead.mjs', logLevel: 'silent' });
const { distressLead } = await import('/tmp/nb-lead.mjs');
for (const m of process.argv.slice(2)) { const l = distressLead(m); console.log(l ? l.vent.toFixed(1).padStart(6) + l.crisis.toFixed(1).padStart(7) : '  null', '|', m); }
