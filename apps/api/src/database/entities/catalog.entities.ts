import { Column, Entity, Index, Unique } from 'typeorm';
import { bigintTransformer } from '../../common/bigint.transformer';
import { PrimaryEntity } from '../base.entity';

@Entity('units')
@Unique(['code'])
export class Unit extends PrimaryEntity {
  @Column({ type: 'varchar', length: 32 })
  code!: string;

  @Column({ type: 'varchar', length: 64 })
  displayName!: string;
}

@Entity('manufacturers')
export class Manufacturer extends PrimaryEntity {
  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  contact!: string | null;
}

@Entity('suppliers')
export class Supplier extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  branchId!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  address!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  contact!: string | null;

  @Column({ default: true })
  active!: boolean;
}

@Entity('storage_profiles')
export class StorageProfile extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  minTempC!: string | null;

  @Column({ type: 'decimal', precision: 8, scale: 2, nullable: true })
  maxTempC!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;
}

@Entity('ingredients')
@Unique(['code'])
export class Ingredient extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  preferredName!: string;
}

@Entity('ingredient_aliases')
export class IngredientAlias extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  ingredientId!: string;

  @Column({ type: 'varchar', length: 255 })
  aliasName!: string;

  @Column({ default: true })
  reviewed!: boolean;
}

@Entity('drug_classes')
@Unique(['code'])
export class DrugClass extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;
}

@Entity('ingredient_class_memberships')
@Unique(['ingredientId', 'drugClassId'])
export class IngredientClassMembership extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  ingredientId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  drugClassId!: string;
}

@Entity('products')
@Unique(['sku'])
export class Product extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  sku!: string;

  @Column({ type: 'varchar', length: 255 })
  tradeName!: string;

  @Column({ type: 'varchar', length: 32 })
  productKind!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  registrationNumber!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  manufacturerId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  dosageForm!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  route!: string | null;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  baseUnitId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, default: '1.000000' })
  quantityStep!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  storageProfileId!: string | null;

  @Column({ default: true })
  active!: boolean;

  @Column({ type: 'int', default: 1 })
  version!: number;
}

@Entity('product_ingredients')
export class ProductIngredient extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  ingredientId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  strengthValue!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  strengthUnit!: string | null;

  @Column({ type: 'decimal', precision: 18, scale: 6, nullable: true })
  denominatorValue!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  denominatorUnit!: string | null;
}

@Entity('product_packages')
export class ProductPackage extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  unitId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  baseQuantity!: string;

  @Column({ default: true })
  active!: boolean;
}

@Entity('product_barcodes')
@Unique(['barcode'])
export class ProductBarcode extends PrimaryEntity {
  @Column({ type: 'varchar', length: 64 })
  barcode!: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  packageId!: string;
}

@Entity('product_prices')
export class ProductPrice extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  packageId!: string;

  @Column({ type: 'decimal', precision: 18, scale: 6 })
  price!: string;

  @Column({ type: 'varchar', length: 8, default: 'THB' })
  currency!: string;

  @Column({ type: 'datetime', precision: 6 })
  validFrom!: Date;

  @Column({ type: 'datetime', precision: 6, nullable: true })
  validTo!: Date | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  approvedBy!: string | null;
}

@Entity('regulatory_classifications')
export class RegulatoryClassification extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  productId!: string;

  @Column({ type: 'varchar', length: 64 })
  classificationCode!: string;

  @Column({ type: 'date' })
  effectiveFrom!: string;

  @Column({ type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sourceId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  approvedBy!: string | null;
}

@Entity('regulatory_rules')
export class RegulatoryRule extends PrimaryEntity {
  @Column({ type: 'varchar', length: 32 })
  reportType!: string;

  @Column({ type: 'varchar', length: 32 })
  ruleVersion!: string;

  @Column({ type: 'date' })
  effectiveFrom!: string;

  @Column({ type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  sourceId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  reviewer!: string | null;
}

@Entity('regulatory_rule_products')
export class RegulatoryRuleProduct extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  ruleId!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  productId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  ingredientId!: string | null;
}

@Entity('knowledge_sources')
export class KnowledgeSource extends PrimaryEntity {
  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  licenseRef!: string | null;
}

@Entity('knowledge_versions')
export class KnowledgeVersion extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  sourceId!: string;

  @Column({ type: 'varchar', length: 32 })
  version!: string;

  @Column({ type: 'date' })
  effectiveFrom!: string;

  @Column({ type: 'date', nullable: true })
  effectiveTo!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'DECLARED_SCOPE' })
  coverage!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  reviewer!: string | null;
}

@Entity('knowledge_rules')
@Index(['knowledgeVersionId', 'ruleType'])
export class KnowledgeRule extends PrimaryEntity {
  @Column({ type: 'bigint', transformer: bigintTransformer })
  knowledgeVersionId!: string;

  @Column({ type: 'varchar', length: 32 })
  ruleType!: string;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  ingredientAId!: string | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintTransformer })
  ingredientBId!: string | null;

  @Column({ type: 'varchar', length: 32 })
  severity!: string;

  @Column({ type: 'varchar', length: 32 })
  defaultAction!: string;

  @Column({ type: 'text', nullable: true })
  evidenceReference!: string | null;
}
