import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const source=path.join(root,'browser-helper');
const version=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8')).version;
const crc=b=>{let c=0xffffffff;for(const v of b){c^=v;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
const locals=[],central=[];let offset=0;
for(const name of fs.readdirSync(source).sort()){
 const p=path.join(source,name);if(!fs.statSync(p).isFile())throw Error('Unexpected extension directory');
 const data=fs.readFileSync(p),filename=Buffer.from(name),checksum=crc(data);
 const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(20,4);local.writeUInt16LE(0x800,6);local.writeUInt16LE(33,12);local.writeUInt32LE(checksum,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(filename.length,26);
 locals.push(local,filename,data);
 const entry=Buffer.alloc(46);entry.writeUInt32LE(0x02014b50);entry.writeUInt16LE(20,4);entry.writeUInt16LE(20,6);entry.writeUInt16LE(0x800,8);entry.writeUInt16LE(33,14);entry.writeUInt32LE(checksum,16);entry.writeUInt32LE(data.length,20);entry.writeUInt32LE(data.length,24);entry.writeUInt16LE(filename.length,28);entry.writeUInt32LE(offset,42);central.push(entry,filename);offset+=local.length+filename.length+data.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(central.length/2,8);end.writeUInt16LE(central.length/2,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...locals,directory,end]);fs.mkdirSync(path.join(root,'public'),{recursive:true});fs.writeFileSync(path.join(root,'public/browser-helper.zip'),archive);fs.writeFileSync(path.join(root,`public/browser-helper-${version}.zip`),archive);
console.log(`Packed browser helper ${version} (${central.length/2} files)`);
