const {spawn}=require('node:child_process');
const {createWriteStream,mkdirSync,writeFileSync,readFileSync,unlinkSync}=require('node:fs');
const {createHash}=require('node:crypto');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
mkdirSync(path.join(root,'backups'),{recursive:true});
const file=path.join(root,'backups',`drugstore-${new Date().toISOString().replace(/[:.]/g,'-')}.sql`);
// The container resolves its credentials. No plaintext secret is logged or passed from the host shell.
const child=spawn('docker',['exec','drugstore-mariadb','sh','-c','exec mariadb-dump --user="$MARIADB_USER" --password="$MARIADB_PASSWORD" --single-transaction --routines --triggers --hex-blob "$MARIADB_DATABASE"'],{windowsHide:true});
const out=createWriteStream(file,{flags:'wx'});let error='';child.stdout.pipe(out);child.stderr.on('data',b=>error+=b);child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('close',code=>{let done=false;out.on('finish',finish);if(out.writableFinished)finish();function finish(){if(done)return;done=true;if(code){try{unlinkSync(file);}catch{}console.error(error||'Backup failed');process.exitCode=1;return;}const sha256=createHash('sha256').update(readFileSync(file)).digest('hex');writeFileSync(file+'.json',JSON.stringify({createdAt:new Date().toISOString(),sha256,database:'drugstore',scope:'database only; excludes .env, credentials and attachments'},null,2));console.log(file);}});
