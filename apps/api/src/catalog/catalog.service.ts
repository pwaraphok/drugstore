import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Product, ProductBarcode, ProductPackage, Unit, ProductPrice } from '../database/entities';

@Injectable()
export class CatalogService {
  constructor(
    @InjectRepository(Product) private readonly products: Repository<Product>,
    @InjectRepository(ProductPackage) private readonly packages: Repository<ProductPackage>,
    @InjectRepository(ProductBarcode) private readonly barcodes: Repository<ProductBarcode>,
    @InjectRepository(Unit) private readonly units: Repository<Unit>,
  ) {}

  search(q?: string) {
    const qb = this.products.createQueryBuilder('p').where('p.active = 1');
    if (q) {
      qb.andWhere('(p.sku LIKE :q OR p.tradeName LIKE :q)', { q: `%${q}%` });
    }
    return qb.orderBy('p.tradeName', 'ASC').take(50).getMany();
  }

  async resolveBarcode(barcode: string) {
    const raw = barcode.trim();
    const row = await this.barcodes.findOne({ where: { barcode: raw } });
    if (!row) throw new NotFoundException({ code: 'BARCODE_NOT_FOUND', message: 'Barcode did not resolve uniquely' });
    const pkg = await this.packages.findOneByOrFail({ id: row.packageId as never });
    const product = await this.products.findOneByOrFail({ id: pkg.productId as never });
    const unit = await this.units.findOneByOrFail({ id: pkg.unitId as never });
    return { barcode: raw, product, package: pkg, unit };
  }

  async productDetail(id: string) {
    const product = await this.products.findOneByOrFail({ id: id as never });
    const packages = await this.packages.find({ where: { productId: id } });
    const units = await this.units.find();
    const prices = packages.length ? await this.products.manager.find(ProductPrice,{where:packages.map(p=>({packageId:String(p.id)})),order:{validFrom:'DESC'}}) : [];
    return { product, packages:packages.map(p=>({...p,unit:units.find(u=>String(u.id)===p.unitId)?.displayName,price:prices.find(v=>v.packageId===String(p.id)&&v.validFrom<=new Date()&&(!v.validTo||v.validTo>new Date()))?.price})) };
  }
}
