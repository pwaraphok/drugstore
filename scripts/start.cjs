const {spawn}=require('node:child_process');
const path=require('node:path');
const fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const dev=process.argv.includes('--dev');
if(!fs.existsSync(path.join(root,'.env')))throw new Error('Missing .env; follow README.md setup.');
if(!dev&&!fs.existsSync(path.join(root,'apps/web/.next/BUILD_ID')))throw new Error('Run npm run build first.');
const children=[];
function launch(args,cwd){const child=spawn(process.execPath,args,{cwd:path.join(root,cwd),stdio:'inherit',windowsHide:true});children.push(child);child.on('exit',code=>{for(const other of children)if(other!==child)other.kill();process.exitCode=code||0;});}
launch(dev?[path.join(root,'node_modules/@nestjs/cli/bin/nest.js'),'start','--watch']:['dist/main.js'],'apps/api');
launch([path.join(root,'node_modules/next/dist/bin/next'),dev?'dev':'start','--hostname','127.0.0.1'],'apps/web');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{children.forEach(c=>c.kill());process.exit();});
console.log('Pharmacy: http://127.0.0.1:3000 — close this terminal to stop.');
