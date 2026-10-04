import { DefaultNamingStrategy, NamingStrategyInterface } from 'typeorm';

function snake(name: string): string {
  return name.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

export class SnakeNamingStrategy extends DefaultNamingStrategy implements NamingStrategyInterface {
  override tableName(className: string, customName: string): string {
    return customName || snake(className);
  }
  override columnName(propertyName: string, customName: string, embeddedPrefixes: string[]): string {
    return snake([...embeddedPrefixes, customName || propertyName].join('_'));
  }
  override relationName(propertyName: string): string {
    return snake(propertyName);
  }
  override joinColumnName(relationName: string, referencedColumnName: string): string {
    return snake(`${relationName}_${referencedColumnName}`);
  }
  override joinTableName(firstTable: string, secondTable: string): string {
    return snake(`${firstTable}_${secondTable}`);
  }
  override joinTableColumnName(tableName: string, propertyName: string, columnName?: string): string {
    return snake(`${tableName}_${columnName || propertyName}`);
  }
}
