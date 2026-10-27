import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(import.meta.url);
const env={...process.env,ESF_DATA_DIR:process.env.ESF_DATA_DIR||path.resolve('.local-data')};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(require('electron'),['.',...process.argv.slice(2)],{stdio:'inherit',env});
child.on('exit',code=>process.exit(code||0));
