import { MigrationInterface, QueryRunner } from 'typeorm';
export class Integrity1791010086000 implements MigrationInterface {
 async up(q:QueryRunner):Promise<void>{
  const links:Record<string,Record<string,string>>={
   products:{base_unit_id:'units'},product_packages:{product_id:'products',unit_id:'units'},product_barcodes:{package_id:'product_packages'},product_prices:{package_id:'product_packages'},
   product_ingredients:{product_id:'products',ingredient_id:'ingredients'},product_lots:{product_id:'products'},inventory_locations:{branch_id:'branches'},
   stock_balances:{lot_id:'product_lots',product_id:'products',location_id:'inventory_locations'},stock_movements:{balance_id:'stock_balances'},
   stock_reservations:{sale_id:'sales',balance_id:'stock_balances'},cost_layers:{lot_id:'product_lots',goods_receipt_item_id:'goods_receipt_items'},
   goods_receipts:{supplier_id:'suppliers',branch_id:'branches'},goods_receipt_items:{goods_receipt_id:'goods_receipts',product_id:'products',lot_id:'product_lots',location_id:'inventory_locations'},
   sales:{branch_id:'branches',patient_id:'patients',cashier_id:'users',shift_id:'cash_shifts'},sale_items:{sale_id:'sales',product_id:'products',package_id:'product_packages'},
   sale_item_allocations:{sale_item_id:'sale_items',product_id:'products',lot_id:'product_lots',balance_id:'stock_balances'},allocation_costs:{allocation_id:'sale_item_allocations',cost_layer_id:'cost_layers'},
   payment_attempts:{sale_id:'sales'},refunds:{original_payment_id:'payment_attempts'},cash_movements:{cash_shift_id:'cash_shifts'},
   patient_allergies:{patient_id:'patients',ingredient_id:'ingredients',product_id:'products',drug_class_id:'drug_classes'},patient_medications:{patient_id:'patients'},
   clinical_checks:{sale_id:'sales'},clinical_alerts:{check_id:'clinical_checks'},clinical_decisions:{check_id:'clinical_checks',alert_id:'clinical_alerts'},
   return_receipts:{original_sale_id:'sales'},return_receipt_items:{return_receipt_id:'return_receipts',original_allocation_id:'sale_item_allocations'},
  };
  for(const [table,cols] of Object.entries(links))for(const [col,target]of Object.entries(cols))await q.query(`ALTER TABLE ${table} ADD CONSTRAINT fk_${table}_${col} FOREIGN KEY (${col}) REFERENCES ${target}(id) ON DELETE RESTRICT`);
  await q.query('ALTER TABLE stock_balances ADD CONSTRAINT chk_stock CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)');
  for(const [table,col]of [['sale_items','quantity_base'],['sale_item_allocations','quantity_base'],['stock_reservations','quantity'],['goods_receipt_items','received_quantity_base'],['payment_attempts','amount'],['refunds','amount']]) await q.query(`ALTER TABLE ${table} ADD CONSTRAINT chk_${table}_positive CHECK (${col} > 0)`);
  for(const table of ['product_lots','product_packages','sale_items','stock_balances'])await q.query(`ALTER TABLE ${table} ADD UNIQUE KEY uq_${table}_product (id,product_id)`);
  await q.query('ALTER TABLE stock_balances ADD CONSTRAINT fk_balance_product_lot FOREIGN KEY (lot_id,product_id) REFERENCES product_lots(id,product_id)');
  await q.query('ALTER TABLE sale_items ADD CONSTRAINT fk_item_package_product FOREIGN KEY (package_id,product_id) REFERENCES product_packages(id,product_id)');
  for(const [col,target] of [['sale_item_id','sale_items'],['lot_id','product_lots'],['balance_id','stock_balances']])await q.query(`ALTER TABLE sale_item_allocations ADD CONSTRAINT fk_allocation_${col}_product FOREIGN KEY (${col},product_id) REFERENCES ${target}(id,product_id)`);
 }
 async down():Promise<void>{throw new Error('Integrity migration requires reviewed forward migration, not destructive rollback');}
}
