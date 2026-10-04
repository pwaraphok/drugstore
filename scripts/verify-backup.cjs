const fs=require('node:fs');const path=require('node:path');const {spawn}=require('node:child_process');const {createHash}=require('node:crypto');
const dir=path.resolve(__dirname,'../backups');const name=fs.readdirSync(dir).filter(f=>f.endsWith('.sql')).sort().at(-1);if(!name)throw Error('Create a backup first');const file=path.join(dir,name);const manifest=JSON.parse(fs.readFileSync(file+'.json','utf8'));if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==manifest.sha256)throw Error('Backup checksum mismatch');
const scratch='drugstore_restore_'+Date.now();
function command(sql,input){return new Promise((resolve,reject)=>{const c=spawn('docker',['exec','-i','drugstore-mariadb','sh','-c',sql],{windowsHide:true});let stdout='',stderr='';c.stdout.on('data',b=>stdout+=b);c.stderr.on('data',b=>stderr+=b);c.on('error',reject);c.on('close',code=>code?reject(Error(stderr)):resolve(stdout));if(input)fs.createReadStream(input).pipe(c.stdin);else c.stdin.end();});}
(async()=>{
 await command(`exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" -e 'CREATE DATABASE ${scratch} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'`);
 await command(`exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" ${scratch}`,file);
 const sql=`SELECT COUNT(*) FROM (SELECT b.id FROM stock_balances b LEFT JOIN stock_movements m ON m.balance_id=b.id GROUP BY b.id,b.on_hand HAVING b.on_hand<>COALESCE(SUM(m.quantity_delta),0)) mismatch`;
 const result=await command(`exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --batch --skip-column-names ${scratch} -e '${sql}'`);
 if(result.trim()!=='0')throw Error('Restored ledger mismatch');
 const tables=await command(`exec mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" --batch --skip-column-names ${scratch} -e 'SHOW TABLES'`);
 if(tables.trim().split('\n').length<50)throw Error('Incomplete database');
 console.log(JSON.stringify({backup:name,restoredDatabase:scratch,checksum:'PASS',ledger:'PASS',tables:tables.trim().split('\n').length,note:'Scratch database retained for inspection; live database unchanged'},null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
