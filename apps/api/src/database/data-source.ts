import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from './entities';
import { SnakeNamingStrategy } from './snake-naming.strategy';
config({path: '../../.env', quiet:true}); config({quiet:true});
export default new DataSource({
 type:'mariadb',host:process.env.DB_HOST || '127.0.0.1',port:Number(process.env.DB_PORT || 3307),
 username:process.env.DB_USER || 'drugstore',password:process.env.DB_PASSWORD || 'drugstore',database:process.env.DB_NAME || 'drugstore',
 entities:ALL_ENTITIES,migrations:[__dirname+'/migrations/*{.ts,.js}'],synchronize:false,
 namingStrategy:new SnakeNamingStrategy(),timezone:'Z',extra:{decimalNumbers:false,supportBigNumbers:true,bigNumberStrings:true},
});
