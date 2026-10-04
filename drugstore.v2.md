# ระบบบริหารร้านขายยา — ข้อกำหนดและสถาปัตยกรรม 2.0

ปรับปรุง: 2 ตุลาคม 2569 (2026-10-02)
ต้นฉบับ: drugstore.original.txt
สถานะ: ข้อกำหนดสำหรับพัฒนาและตรวจรับ ยังไม่ใช่ระบบที่พัฒนา/ทดสอบแล้วหรือการรับรองมาตรฐาน

## 1. ขอบเขตและสมมติฐาน

ครอบคลุมจัดซื้อ รับสินค้า สต็อก งานขาย การจ่ายยา การชำระเงิน คืนสินค้า รายงาน และหลักฐานตรวจสอบย้อนหลัง ฉบับนี้แทนตัวอย่าง SQL/โค้ดเดิมที่ยังไม่ครบวงจร

รุ่นแรก: ร้านเดียว หลายเครื่องขาย หลายตำแหน่งเก็บ ฐานข้อมูลกลาง ต้องเชื่อมต่อขณะยืนยันขาย เตรียม branch_id และสิทธิ์ตามสาขาตั้งแต่ต้น
รวมในรุ่นแรก: ผู้ใช้ เภสัชกร ผู้ป่วย ข้อมูลยา หน่วยบรรจุ จัดซื้อ รับเข้า FEFO ประวัติสต็อก POS รับเงิน คืน/กักกัน/เรียกคืน ฉลาก รายงาน ความปลอดภัย สำรองและกู้คืน
ต่อยอดภายหลัง: หลายสาขา โอนข้ามสาขา สมาชิก โปรโมชั่นซับซ้อน บัญชีภายนอก และออนไลน์
การขายออฟไลน์เต็มรูปแบบยังไม่เปิด ใช้ขั้นตอนสำรองที่ควบคุมเอกสารและกระทบยอดภายหลัง

## 2. สถาปัตยกรรม

- Frontend: Next.js, TypeScript, React, Tailwind CSS
- Backend: NestJS แบบ modular monolith แยก Identity, Catalog, Purchasing, Inventory, Clinical, Sales, Payments, Compliance, Reporting, Printing
- Database: MariaDB/InnoDB; เลือกรุ่นที่ยังได้รับการสนับสนุนและล็อกรุ่นก่อนพัฒนา
- ORM: TypeORM ใช้ EntityManager เดียวต่อธุรกรรมธุรกิจ ห้าม inventory service commit แยกจากบิล
- REST/HTTPS พร้อม OpenAPI; WebSocket ใช้แจ้งสถานะ ไม่เป็นแหล่งยืนยันยอด
- Transactional outbox และ worker สำหรับพิมพ์/แจ้งเตือน/ส่งออก; consumer ต้องป้องกันผลซ้ำ
- เอกสารใบสั่งยาและหลักฐานใช้ private storage ตรวจสิทธิ์และลิงก์ชั่วคราว
- HID scanner และเครื่องพิมพ์ผ่าน browser print หรือ local print bridge ที่ยืนยันตัวตน
- ฐานข้อมูลเป็นแหล่งข้อมูลหลัก ต้องตรวจยอดใหม่ก่อนยืนยัน
- แยก development/staging/production ใช้ข้อมูลจำลองในระบบทดสอบ

Flow: UI -> authentication/authorization -> application service -> validation -> DB transaction -> outbox -> worker/อุปกรณ์/บริการภายนอก
ไม่รอ payment provider หรือเครื่องพิมพ์ระหว่างถือ DB locks

## 3. กติกาข้อมูลที่ต้องรักษาเสมอ

INV-01: on_hand >= 0 และ 0 <= reserved <= on_hand
INV-02: available = on_hand - reserved; ขายเฉพาะล็อต/ตำแหน่ง/สภาพที่อนุญาต
INV-03: on_hand เท่าผลรวม stock_movements ของสินค้า/ล็อต/ตำแหน่ง/สภาพ รวมยอดเปิด
INV-04: ผลรวม allocations เท่าจำนวนฐานที่จ่ายจริง
INV-05: lot, package, balance และ sale item ต้องอ้างสินค้าเดียวกัน
INV-06: เอกสารลงบัญชีแล้วห้ามแก้ทับ/ลบ ใช้ reversal อ้างต้นฉบับ
INV-07: คำขอหรือ event ซ้ำต้องไม่สร้างผลธุรกิจซ้ำ
INV-08: คืนสินค้า/เงินสะสมต้องไม่เกินสิทธิ์คงเหลือ
INV-09: ไม่มีคำเตือนไม่เท่ากับรับรองความปลอดภัย
INV-10: รายงานย้อนหลังคงข้อมูล ณ วันทำรายการและติดตามการแก้ไขได้

มาตรฐานข้อมูล:
- PK BIGINT; ส่ง ID ใน JSON เป็น string ป้องกันสูญเสียความแม่นยำ
- จำนวนฐาน DECIMAL(18,6) พร้อม quantity_step ต่อสินค้า; ตรวจค่าจำกัด > 0 และตรง step หลังแปลงหน่วย
- ยอดเงิน DECIMAL(18,2), ราคาคำนวณ/ต้นทุน DECIMAL(18,6); ห้าม binary float คิดเงิน
- เก็บ currency วิธีปัดเศษ การกระจายส่วนลด/ภาษี ผลรวมรายการตรงยอดบิล
- timestamp UTC แสดงและกำหนดวันธุรกิจ Asia/Bangkok; วันหมดอายุไม่แปลง timezone
- expiry_raw, expiry_precision DAY/MONTH, usable_until_exclusive ตามนโยบายเภสัชกรอนุมัติ ห้ามเดาจากข้อมูลไม่ชัดเจน
- FK RESTRICT กับประวัติธุรกรรม ปิดใช้งาน master แทน cascade delete
- DB constraints ร่วมกับ server validation และ version ป้องกันข้อมูลเก่าทับข้อมูลใหม่

## 4. โครงสร้างฐานข้อมูลเชิงตรรกะ

ตารางต่อไปนี้เป็น logical schema ต้องทำ field-level data dictionary ระบุชนิด nullable/default/FK/index/validation และ migration ก่อนพัฒนา ทุกธุรกรรมมี id, branch_id, created_at/by ตามบริบท การเปลี่ยนสถานะเก็บผู้ทำ เวลา เหตุผล

### 4.1 ร้าน ผู้ใช้ ผู้ป่วย
- branches: code UNIQUE, name, address, timezone, license_reference, active
- users: login_identifier UNIQUE, password_hash/identity_provider_id, status
- roles, permissions, user_roles, role_permissions: สิทธิ์ตามการกระทำและสาขา
- pharmacists: user_id, name, license_number, verification_status, verified_at
- pharmacist_shifts: pharmacist_id, branch_id, started_at, ended_at, verified_by
- patients: patient_number UNIQUE, name, birth_date, contact เท่าที่จำเป็น, allergy_status, record_version
- patient_contexts: patient_id, ข้อมูลประกอบการประเมิน, source, recorded_at, reviewed_at
- patient_allergies: patient_id, target_type, ingredient_id/drug_class_id/product_id ตาม target_type, raw_name, reaction, severity, verification_status, reporter, onset_date
- patient_medications: patient_id, product/ingredient_reference, raw_name, dose_text, start/end_date, active_status, source
- prescriptions/items: patient, prescriber_reference, issued_at, attachment, verification; product/ingredient, quantity, unit, dose, route, frequency, duration, instructions
- encounters: patient_id, pharmacist_id, complaint, assessment_note, counseling_note, referral_note, occurred_at
- attachments: storage_key, mime_type, checksum, size, document_type, access_scope, retention_policy_id

### 4.2 สินค้าและยา
- products: sku UNIQUE, trade_name, product_kind, registration_number, manufacturer_id, dosage_form, route, base_unit_id, quantity_step, storage_profile_id, active, version
- ingredients: code UNIQUE, preferred_name; ingredient_aliases: ชื่อพ้องที่ทบทวนแล้ว
- product_ingredients: product_id, ingredient_id, strength_value/unit, denominator_value/unit รองรับสูตรผสม
- drug_classes, ingredient_class_memberships: กลุ่มยาตามฐานความรู้ที่ทวนสอบ
- units: code UNIQUE, display_name
- product_packages: product_id, unit_id, base_quantity > 0, active เช่น แผง 10 เม็ด กล่อง 100 เม็ด
- product_barcodes: barcode UNIQUE, package_id เป็น string รักษาเลขศูนย์นำหน้า
- product_prices: package_id, price, currency, valid_from/to, approved_by
- manufacturers, suppliers: ชื่อ ที่อยู่ ติดต่อ เอกสารที่เกี่ยวข้อง
- regulatory_classifications: product_id, classification_code, effective_from/to, source_id, approved_by
- regulatory_rules/rule_products: report_type, rule_version, effective_from/to, product/ingredient scope, source_id, reviewer
ไม่ใช้ category เดียวแทนหมวดสินค้า ประเภทยาตามกฎหมาย และเงื่อนไขรายงาน

### 4.3 จัดซื้อและคลัง
- purchase_orders/items: supplier, ordered quantity/package, expected_cost, status, approval
- goods_receipts/items: PO reference, supplier_document, received quantity, lot_id, cost, inspector, received_at
- product_lots: product_id, manufacturer_id, lot_number, expiry_raw/precision, usable_until_exclusive, manufacture_date, global_status
- inventory_locations: branch_id, code, location_type, storage_profile_id, status
- stock_balances: product_id, lot_id, location_id, condition_status, on_hand, reserved, version
- stock_movements: balance_id, quantity_delta, movement_type, business_document/line_id, reversal_of, cost_snapshot, actor, occurred_at, posted_at
- cost_layers: goods_receipt_item_id, lot_id, received_quantity, remaining_quantity, unit_cost; ล็อตเดิมรับหลายราคาต้องแยกต้นทุน
- stock_reservations: sale_id, balance_id, quantity, status, expires_at
- stock_counts/items: snapshot/version, counted_quantity, discrepancy, approved_adjustment_id
- stock_adjustments/items: reason, quantity_delta, requester, approver, evidence
- inventory_transfers/items: source/destination, lot, dispatched/received quantities, IN_TRANSIT state
- return_receipts/items: original_allocation_id, quantity, inspection_status, quarantine_location_id
- supplier_returns/items: supplier, original_receipt_id, lot, quantity, credit_reference
- recalls/recall_lots/recall_actions: reason, source, affected lots, blocked_at, tasks, disposition
- storage_profiles/readings/excursions: limits/version, location, measured_at, values, action, reviewer
- disposal_records: lot, quantity, reason, evidence, approver, movement_id

### 4.4 ขาย เงิน และหลักฐาน
- sales: invoice_number UNIQUE, patient_id nullable ตามกรณี, cashier_id, pharmacist_id ตามกฎ, shift_id, status, totals, currency, cart_version
- sale_items: sale_id, product_id, package_id, quantity, conversion_snapshot, quantity_base, unit_price, discounts, taxes, line_total, product_snapshot
- sale_item_allocations: sale_item_id, product_id, lot_id, balance_id, quantity_base
- allocation_costs: allocation_id, cost_layer_id, quantity, unit_cost_snapshot
- dispensing_records: sale_item_id, prescription_item_id nullable, encounter_id, directions_snapshot, pharmacist_id, released_at
- clinical_checks: sale_id, cart_version, patient_record_version, input_hash, knowledge_version, execution_status, coverage_status, assessed_at
- clinical_alerts/decisions: check_id, rule_id, severity, evidence_reference, action, reason, actor, decided_at
- knowledge_sources/versions/rules: provenance, license, version, effective dates, coverage, reviewer, rule definitions
- payment_attempts: sale_id, method, amount, status, provider, provider_reference, idempotency_key
- payment_events: provider_event_id, attempt_id, verified_at, status, sanitized_payload_reference
- refunds: original_payment_id, return_id nullable, amount, status, reason, provider_reference
- sale_reversals: original_sale_id, reason, approval, linked stock/payment documents
- cash_shifts/movements: opening_float, expected_cash, counted_cash, variance, approval; cash in/out มีเหตุผล
- supplier_invoices/items, supplier_credit_notes, supplier_payments/allocations: เอกสารผู้จำหน่าย ยอด/วันครบกำหนด การจับคู่ใบรับ เครดิต และยอดจ่าย
- idempotency_requests: scope, key, request_hash, status, resource_id, safe_response, created_at, expires_at
- outbox_events/inbox_events: event_id, state, attempt_count, next_attempt_at, payload_reference
- print_jobs: document_id/version, template_version, printer_id, state, attempt_count, duplicate_of
- audit_events: actor, action, entity, timestamp, correlation_id, reason, redacted_before/after
- compliance_exports: report_type, period, rules_version, source_document_ids/hash, file_checksum, generated_by, revision
- SOPs, SOP_acknowledgements, training_records, complaints, corrective_actions: หลักฐานระบบคุณภาพ
- privacy_policies, processing_records, consent_records, retention_policies, data_subject_requests: วัตถุประสงค์ ฐานการประมวลผล เวอร์ชันนโยบายและการดำเนินงาน

### 4.5 ความสัมพันธ์และข้อบังคับ
products 1:N packages/lots/product_ingredients
lots 1:N stock_balances; balances 1:N movements/reservations
sales 1:N sale_items; sale_items 1:N allocations/dispensing_records
patients 1:N allergies/medications/prescriptions/encounters
sales 1:N payments/clinical_checks; payments 1:N refunds

- UNIQUE(lot_id, location_id, condition_status) บน balances
- Composite FK (lot_id, product_id) -> product_lots(id, product_id) พร้อม UNIQUE รองรับ
- Composite FK ของ allocation ไป sale_item/lot/balance และ package ไป product ป้องกันสินค้าไม่ตรง
- lot identity ใช้ product/manufacturer/lot number และ expiry ที่ตรวจแล้ว; ข้อมูลขัดแย้งเข้า review
- FEFO index: product_id, global_status, usable_until_exclusive, id; balance index ตาม location/product/status
- ประวัติ index: entity/id/time, patient/time, sale/status/time, outbox/state/next_attempt_at
- UNIQUE(scope,key), UNIQUE(provider,event_id/reference), UNIQUE(event_id) สำหรับ deduplication
- movement uniqueness: document type + document line + movement leg; reversal รวมไม่เกินต้นฉบับ
- DB checks จำนวน/เงินตามชนิดรายการ และ on_hand >= reserved

## 5. จัดซื้อ รับเข้า และคลัง

PUR-01: PO DRAFT -> APPROVED -> PARTIALLY_RECEIVED -> RECEIVED/CLOSED; ยกเลิกเฉพาะยอดค้างตามสิทธิ์
PUR-02: รับบางส่วน/หลายครั้ง ตรวจเอกสารซ้ำ จำนวน หน่วย ล็อต expiry สภาพ ต้นทุน
PUR-03: ข้อมูลไม่ครบ/ไม่ผ่านตรวจรับเข้า QUARANTINED ไม่เพิ่มยอดขายได้
PUR-04: ใบรับ balance movement cost layer audit บันทึกพร้อมกัน; แก้เอกสารลงบัญชีด้วย reversal
INV-11: lot RELEASED/RECALLED/BLOCKED; stock condition SELLABLE/QUARANTINED/DAMAGED
INV-12: ตรวจ usable_until_exclusive ทุกครั้ง ไม่พึ่งงานรายวันเปลี่ยนสถานะ
INV-13: โอนมี movements ออก/เข้าเป็นคู่; ระหว่างขนส่งใช้ IN_TRANSIT
INV-14: ตรวจนับล็อกช่วงนับหรือกระทบ movements หลัง snapshot ก่อนปรับ ห้ามยอดเก่าทับยอดขายใหม่
INV-15: ปรับยอด/ทำลายมีเหตุผล หลักฐาน และอนุมัติตามเกณฑ์
INV-16: FEFO เลือกล็อต; ต้นทุนรุ่นแรกใช้ cost layers รับก่อนภายในล็อต ห้ามเปลี่ยนวิธีย้อนหลังเงียบ ๆ
INV-17: เตือนสต็อกต่ำและใกล้หมดอายุ 30/60/90 วันเป็นค่าเริ่มต้นปรับได้ ไม่ใช่เกณฑ์กฎหมาย
INV-18: โอน/คืน/ปรับ/ทำลายต้องเปลี่ยน cost layers และ quantity ledger ใน transaction เดียวกัน เก็บ cost provenance ตามต้นฉบับ รับคืนใช้ต้นทุน allocation เดิม ไม่ใช้ราคาซื้อปัจจุบัน
INV-19: เปลี่ยน stock condition ด้วย movement ออก/เข้าเป็นคู่เพื่อกระทบ ledger; แก้ global lot status โดยไม่เปลี่ยนจำนวนและเก็บ audit
INV-20: รับเกิน PO ต้องมีเพดาน/ผู้อนุมัติ รับไม่มี PO ต้องมีเหตุผล/สิทธิ์ ภาระผู้จำหน่ายอ้าง invoices/credit notes/payments ไม่ใช้ยอดรับเพียงอย่างเดียว

## 6. FEFO และธุรกรรมขาย

SALE-01: ค้น/สแกน เลือกหน่วย แสดงยอดขายได้และล็อตที่จะจ่าย
SALE-02: รหัสสินค้าทั่วไปไม่ยืนยันล็อตที่หยิบ ต้องสแกนรหัสล็อตภายในหรือยืนยันล็อตก่อนส่งมอบ
SALE-03: เลือก lot RELEASED, stock SELLABLE, location เปิดใช้, ไม่ถึง usable_until_exclusive และ available > 0
SALE-04: เรียง expiry ASC, received_at ของ stock/cost layer ASC, lot_id ASC
SALE-05: เปลี่ยนล็อตจาก FEFO ต้องมีสิทธิ์/เหตุผล ห้ามเลือกล็อตห้ามขายแม้เป็น admin
SALE-06: server คำนวณราคา ส่วนลด ภาษี ยอดรวม ไม่เชื่อยอด client
SALE-07: เปลี่ยนผู้ป่วย ยา จำนวน วิธีใช้ หรือข้อมูลสำคัญ ต้องทำให้ผลตรวจคลินิกเก่าหมดอายุ

เตรียมขาย: ตรวจสิทธิ์/กะ/เภสัชกร -> ตรวจสินค้า/จำนวน -> ประเมินผู้ป่วย/ใบสั่ง -> จองล็อต -> AWAITING_PAYMENT
Reservation เริ่มต้น 10 นาที ปรับได้; เปลี่ยนตะกร้าจัดสรรใหม่ใน transaction

ข้อกำหนด finalize (pseudocode ไม่ใช่โค้ด deploy):
BEGIN TRANSACTION
  รับ/ล็อก idempotency key; hash เหมือนคืนผลเดิม ต่างคืน conflict
  ล็อก sale ตรวจสถานะ/version/payment evidence/clinical decision
  ล็อก lot และ balance ตาม product_id, lot_id, balance_id ในลำดับเดียวกันทุก flow
  ตรวจ expiry/recall/location/reservation/จำนวนอีกครั้ง
  ลด on_hand/reserved ลง SALE movements และ cost allocations
  บันทึก items/allocations/snapshots/dispensing/payment linkage
  เปลี่ยน COMPLETED ลง audit/outbox และผล idempotency
COMMIT

- InventoryService รับ EntityManager ผู้เรียก ไม่ commit stock ก่อนบิล
- สินค้าใดไม่พอ rollback ทั้งบิล ไม่ขายบางส่วนโดยไม่แก้บิลชัดเจน
- รับเข้า จอง recall และขายใช้ lock protocol เดียวกัน ล็อก lot ก่อน balance
- 0/ติดลบ/NaN/precision เกิน/หน่วยผิด/สินค้าไม่พบ ปฏิเสธ ไม่ข้ามเงียบ
- deadlock retry จำกัดพร้อม backoff/key เดิม ไม่ retry เก็บเงินไร้เงื่อนไข
- ปล่อย reservation ล็อก sale/reservation เช่นเดียวกับ finalize และทำได้ครั้งเดียว
- timeout ตรวจผล key เดิมก่อนส่งใหม่ สำเร็จเมื่อได้ committed sale ID

## 7. สถานะบิล รับเงิน และกระทบยอด

แยกสถานะขาย เงิน และคืนสินค้า:
Sale: DRAFT -> AWAITING_PAYMENT -> COMPLETED; ยกเลิกก่อนเสร็จตามเงื่อนไข
Payment: CREATED -> PENDING -> SUCCEEDED/FAILED/CANCELLED; UNKNOWN ต้องตรวจ provider
Refund: REQUESTED -> PENDING -> SUCCEEDED/FAILED; timeout ไม่แปลว่าล้มเหลว
Return: REQUESTED -> RECEIVED_QUARANTINE -> ASSESSED -> CLOSED
บิล COMPLETED ใช้ reversal/return ไม่กลับเป็น draft

PAY-01: เงินสด PromptPay บัตร และแบ่งจ่ายหลาย attempts
PAY-02: เงินสดแยก received/change/applied_amount; applied รวมตรงยอดบิล
PAY-03: webhook ตรวจ signature merchant currency amount reference และ event ซ้ำ/สลับ; ห้ามลดสำเร็จเป็น pending
PAY-04: QR/สลิปอย่างเดียวไม่ใช่ SUCCEEDED ใช้ผล provider/ธนาคารหรือการตรวจมือที่กำหนดสิทธิ์และหลักฐาน
PAY-05: เก็บข้อเท็จจริงการรับเงินแม้บิลหมดเวลา ไม่ทิ้ง event
PAY-06: รับเงินแล้ว finalize ไม่สำเร็จ -> คิว PAID_UNFULFILLED เพื่อตรวจ/ยืนยันใหม่หรือคืนเงิน ไม่เก็บซ้ำ
PAY-07: จ่ายหลังจองหมดอายุ -> จัดสรรและตรวจใหม่ ถ้าจ่ายยาไม่ได้ให้คืนตาม workflow
PAY-08: ห้ามยกเลิกบิลที่มีเงินโดยไม่จัดการเงินนั้น ติดตาม refund จนยืนยัน
PAY-09: reconcile sale/payment/provider settlement/refund รายวัน พร้อมคิวส่วนต่างและผู้รับผิดชอบ
PAY-10: ไม่เก็บเลขบัตรเต็ม/รหัสความปลอดภัย ใช้ token/reference
PAY-11: ปิดกะ: opening + received - change - cash refunds + cash in - cash out เทียบ counted พร้อมเหตุผล
PAY-12: ส่วนลดเกินเพดาน/คืนเงิน/ปรับเงินอนุมัติตามสิทธิ์ ภาษี/ปัดเศษมีนโยบายเวอร์ชัน
PAY-13: ล็อก sale ก่อนรวม successful payments และล็อก original payment ก่อนจองยอด refund; ยอดคืนสำเร็จรวมยอดคืนที่กำลังดำเนินการต้องไม่เกินยอดรับสุทธิที่คืนได้
PAY-14: หากหลาย attempts สำเร็จรวมเกินยอดบิล ให้บันทึกเงินเกินและจัดการคืนตาม workflow ไม่ทิ้งหลักฐานหรือเพิ่มยอดขายให้เท่ารับเงิน

## 8. คืนสินค้าและเรียกคืน

RET-01: อ้าง allocation เดิม ล็อกยอดคืนสะสม ป้องกันเกินและคำขอพร้อมกัน
RET-02: แยกคืนเงิน รับคืนสินค้า และอนุญาตกลับขาย
RET-03: สินค้าคืนเข้ากักกัน เภสัชกรประเมินสภาพ/การเก็บ/เงื่อนไข
RET-04: disposition คืนผู้จำหน่าย/ทำลาย/กักกัน/กลับ sellable เฉพาะผ่านนโยบายทบทวนแล้ว
REC-01: recall บล็อกล็อตและ reservations ไม่ส่งมอบ แจ้งบิลรับเงินแล้วที่ได้รับผลกระทบ
REC-02: trace lot -> receipt/supplier -> allocation -> patient/contact ตามสิทธิ์
REC-03: ไม่มี contact ให้แสดงข้อจำกัดติดตาม ไม่สร้างผู้ป่วยสมมติ
REC-04: เก็บการติดตาม ปริมาณคืน ผล ผู้ปิดเรื่อง; ติดต่อจริงโดยผู้มีสิทธิ์ตามขั้นตอน

## 9. ผู้ป่วยและ Clinical Engine

CLI-01: allergy_status UNKNOWN/NOT_ASKED/NO_KNOWN_ALLERGIES/KNOWN_ALLERGIES พร้อมผู้ยืนยัน/เวลา
CLI-02: ingredient IDs/mappings ทบทวนแล้ว; raw text จับคู่ไม่ได้เข้า review
CLI-03: execution_status COMPLETED/FAILED/NOT_RUN และ coverage_status COMPLETE_FOR_DECLARED_SCOPE/PARTIAL/UNKNOWN พร้อม alerts/missing_inputs
CLI-04: แสดง 'ไม่พบคำเตือนจากข้อมูลและขอบเขตที่ตรวจ' ห้าม isSafe=true จาก alerts ว่าง
CLI-05: รุ่นแรกตรวจ allergy, interactions ในตะกร้าและ active medications, duplicate ingredients ตามกฎทวนสอบ
CLI-06: canonical unordered ingredient pairs/batch query เก็บทุกกฎที่เข้าเงื่อนไข ไม่ findOne ซ่อนคำเตือน
CLI-07: null/product ไม่ครบไม่ crash ไม่ข้ามเงียบ; unmatched ลด coverage
CLI-08: contraindication/dose checks เปิดเมื่อมีข้อมูล หน่วย กฎทวนสอบ มิฉะนั้น NOT_EVALUATED
CLI-09: severity แยกจาก workflow action BLOCK/REQUIRE_PHARMACIST_REVIEW/INFORM
CLI-10: BLOCK ไม่มี override ทั่วไป ต้องแก้ข้อมูลหรือแนวทางจ่ายและตรวจใหม่
CLI-11: review เก็บเภสัชกร เหตุผล ข้อมูลประกอบและผล ไม่ใช้รับทราบแทนเหตุผล
CLI-12: ผลผูก cart_version/patient_record_version/knowledge_version/input_hash ต้องตรงก่อนส่งมอบ
CLI-13: knowledge มี source/license/version/reviewer/effective dates/coverage ไม่ใช้ข้อมูลตัวอย่าง production
CLI-14: ล่ม/ข้อมูลไม่ครบ -> NEEDS_REVIEW; ประเมินมือเฉพาะนโยบายอนุญาต บันทึกผู้ตรวจ/แหล่งข้อมูล ไม่ผ่านอัตโนมัติ
CLI-15: เก็บซักประวัติ คำแนะนำ ส่งต่อ ใบสั่ง ผู้ส่งมอบตามบริบท ระบบช่วยตรวจโดยไม่แทนเภสัชกร

## 10. บาร์โค้ด ฉลาก และงานพิมพ์

BAR-01: รองรับหลายบรรจุภัณฑ์/บาร์โค้ด แต่หนึ่งรหัสต้อง resolve แน่นอน
BAR-02: รหัสล็อตภายในแยก namespace จากสินค้า payload ไม่มีข้อมูลสุขภาพ
BAR-03: GS1 ต้องกำหนดชนิด parser/test vectors ที่รองรับจริง รหัสอ่านไม่ได้ตรวจมือ ไม่เดาล็อต/expiry
BAR-04: handler เฉพาะบริบทสแกน ไม่ดักช่องผู้ป่วย/วิธีใช้/IME รองรับ prefix/suffix และ timeout ตั้งค่าได้
BAR-05: ไม่ใช้ความเร็ว keypress อย่างเดียวระบุ scanner รองรับสแกนซ้ำที่ตั้งใจ
PRN-01: ฉลากมีผู้ป่วยตามบริบท ชื่อยา ความแรง รูปแบบ จำนวน วิธีใช้ คำเตือน วันจ่าย ร้าน ผู้จ่าย และช่องอื่นตามแม่แบบอนุมัติ
PRN-02: พิมพ์จาก directions/product snapshot ไม่ดึง master ปัจจุบันแทน
PRN-03: ฉลากยาเริ่มต้น 80x50 mm สติกเกอร์ 50x30 mm ทดสอบเครื่องจริง ไม่ truncate ข้อมูลสำคัญ
PRN-04: ข้อความยาวใช้หลายใบ/แม่แบบใหญ่ ห้ามลดจนอ่านไม่ได้ คำเตือนอ่านได้ในขาวดำ
PRN-05: QUEUED/SENT/CONFIRMED/FAILED/UNKNOWN; browser dialog สำเร็จไม่ยืนยันกระดาษออก
PRN-06: timeout หลังส่งอาจพิมพ์แล้ว ให้ตรวจและสั่งซ้ำชัดเจนพร้อม audit/สำเนา
PRN-07: reprint อ้างบิลเดิม ไม่ตัดสต็อก/เก็บเงินใหม่; bridge จำกัด origin/เครื่องที่ลงทะเบียน

## 11. รายงาน กฎกำกับ และหลักฐาน GPP

แก้จากต้นฉบับ: ห้ามใช้ view_gpp_khoyor_11 รวม DANGEROUS_DRUG และ SPECIALLY_CONTROLLED_DRUG ทั้งหมด
รายการแบบฟอร์มกองยา อย. แยก ข.ย.9 บัญชีซื้อ, ข.ย.10 ขายยาควบคุมพิเศษ, ข.ย.11 ขายยาอันตรายเฉพาะรายการที่กำหนด, ข.ย.12 ขายตามใบสั่งยาของผู้ประกอบวิชาชีพที่เกี่ยวข้อง [S1]

REG-01: mapping รายงานกับรายการยา/กฎ ช่วงวันที่มีผล source ผู้ทวนสอบ
REG-02: ข.ย.9 ข้อมูลซื้อ/รับเข้า; ข.ย.10/11 การจ่ายเข้าเกณฑ์; ข.ย.12 เชื่อมใบสั่งกับการจ่ายจริง
REG-03: ตรวจแบบอื่น เช่น ข.ย.13 และกฎเฉพาะผลิตภัณฑ์/ใบอนุญาตก่อนเปิดกลุ่มนั้น ไม่อ้างครอบคลุมทั้งหมด
REG-04: field mapping แบบจริงมีชื่อช่อง แหล่งข้อมูล validation เงื่อนไขบังคับ หลักฐาน ผู้ทวนสอบ
REG-05: ระยะเก็บ ลงนาม วิธีแก้บัญชี การยอมรับอิเล็กทรอนิกส์ ต้องยืนยันจากกฎใช้จริงก่อนเปิดงาน
REG-06: export ผูก snapshots/rule version/period/ผู้สร้าง/checksum แก้ด้วย revision อ้างฉบับเดิม
REG-07: หน่วยตามแบบต้องกระทบธุรกรรม; คืน/ยกเลิกใช้วิธีแสดงที่ทบทวน ไม่ลบต้นฉบับ
REG-08: มีรายงานไม่รับรองผ่าน GPP ต้องทวนกับคู่มือและข้อกำหนดร้าน [S2]

ตารางหลักฐานเสนอให้เทียบข้อกำหนดจริง:

| ด้าน | กระบวนการ/ข้อมูล | หลักฐาน | ผู้รับผิดชอบ |
|---|---|---|---|
| บุคลากร | profile/shift | ผู้ปฏิบัติการและเวลา | ผู้จัดการ/เภสัชกร |
| รับ/จัดเก็บ | receipt/inspection/storage reading | รับสินค้า/อุณหภูมิ/การแก้เหตุผิดเกณฑ์ | ผู้ดูแลคลัง |
| จ่ายยา | prescription/encounter/dispensing | คำแนะนำ/ผู้จ่าย | เภสัชกร |
| คุณภาพสินค้า | quarantine/recall/disposal | ผลดำเนินการและจำนวน | เภสัชกร/ผู้อนุมัติ |
| ระบบคุณภาพ | SOP/training/complaints/corrective actions | เวอร์ชัน ผู้รับผิดชอบ วันติดตาม | ผู้รับผิดชอบคุณภาพ |

รายงานบริหาร: ยอดขาย รับเงิน คืนเงิน กำไรจากต้นทุน สต็อกตามล็อต อายุสินค้า สินค้าใกล้หมด ส่วนต่างสต็อก ภาระผู้จำหน่าย และ reconciliation ค้าง ทุกหน้ามีช่วงเวลา สาขา timezone หน่วย และเวลาอัปเดต

## 12. สิทธิ์ ความปลอดภัย และความเป็นส่วนตัว

| บทบาท | สิทธิ์หลัก | ข้อจำกัด |
|---|---|---|
| Cashier | สร้างบิล รับเงิน พิมพ์ซ้ำ | ข้อมูลผู้ป่วยเท่าที่จำเป็น ไม่อนุมัติคลินิก |
| Pharmacist | ประเมินผู้ป่วย/ใบสั่ง/คำเตือน ยืนยันจ่าย ประเมินกักกัน | ตามสาขาและสถานะปฏิบัติการ |
| Inventory | จัดซื้อ รับเข้า ตรวจนับ เสนอปรับยอด | ไม่อนุมัติคลินิก |
| Manager | อนุมัติราคา/ส่วนลดเกินเพดาน ปรับยอด คืนเงิน ปิดกะ | ตามวงเงินและสิทธิ์ |
| Auditor | อ่านรายงาน/audit | จำกัดข้อมูลและห้ามแก้ธุรกรรม |
| System admin | จัดการระบบ/ผู้ใช้ | ไม่ได้สิทธิ์อ่านสุขภาพ/จ่ายยาอัตโนมัติ |

คนเดียวมีหลายบทบาทได้ แต่บันทึกบทบาทที่ใช้และกำหนดการทบทวนรายการเสี่ยงแยกตามนโยบาย
SEC-01: permission/branch scope ทุก API รวม download/export และการเดา ID
SEC-02: MFA สิทธิ์สำคัญ session expiry device revoke rate limit lockout ตามนโยบาย
SEC-03: password hashing ผ่าน library ทบทวนแล้ว TLS encryption at rest secrets manager/key rotation
SEC-04: private attachments ตรวจชนิด/ขนาด/มัลแวร์ signed URL อายุสั้น ไม่ log token/password/สุขภาพ
SEC-05: audit append-only จำกัดสิทธิ์แก้ ส่งสำเนาแยก รวมดู/ส่งออกข้อมูลอ่อนไหวและเปลี่ยนสิทธิ์
SEC-06: backup เข้ารหัสแยกสิทธิ์จากฐานหลัก พร้อม restore test
PRIV-01: ทบทวนวัตถุประสงค์/ฐานการประมวลผลกับผู้รับผิดชอบ PDPA ไม่สมมติว่าทุกกรณีใช้ consent
PRIV-02: เก็บเท่าที่จำเป็น แจ้ง notice เก็บ consent เมื่อใช้ฐานนั้น แยกการตลาดจากบริการ
PRIV-03: retention แยกชนิดเอกสาร/ภาระกฎหมาย; legal hold กันลบก่อนกำหนด
PRIV-04: คำขอเข้าถึง/แก้ไข/ลบ/ถอนยินยอมตรวจตัวตนและข้อยกเว้น ไม่ลบธุรกรรมอัตโนมัติ
PRIV-05: หมดระยะเก็บให้ลบ/ทำให้ไม่ระบุตัวบุคคลตามนโยบาย รวมสำเนาและวงจร backup
PRIV-06: incident plan ผู้รับผิดชอบและการแจ้งตามเงื่อนไข/เวลาที่ผู้รับผิดชอบยืนยันก่อนเปิด

## 13. API และข้อผิดพลาด

กลุ่มขั้นต่ำ:
- /sessions, /users, /roles, /pharmacist-shifts
- /products, /packages, /barcodes/resolve, /lots, /inventory/availability
- /purchase-orders, /goods-receipts, /stock-counts, /stock-adjustments, /transfers
- /patients, /allergies, /medications, /prescriptions, /encounters
- /sales, /sales/{id}/clinical-checks, /sales/{id}/reservations, /sales/{id}/finalize
- /payment-attempts, /payment-webhooks/{provider}, /refunds, /reconciliation
- /returns, /recalls, /disposals, /print-jobs, /reports, /audit-events

API-01: mutation มี schema validation/authorization/correlation ID; การลงธุรกิจใช้ idempotency key
API-02: error มี code/safe message/field errors/correlation ID ไม่ส่ง stack trace/ข้อมูลสุขภาพ
API-03: 409 version/key conflict, 422 กฎธุรกิจ/ข้อมูลไม่ครบ, 403 สิทธิ์ไม่พอ
API-04: pagination/จำกัด export งานใหญ่ async พร้อมลิงก์หมดอายุ
API-05: outbox/inbox at-least-once + deduplication, retry จำกัด และ dead-letter มีผู้แก้
API-06: key retention ตามช่วง retry; references การเงินและ movement uniqueness กันซ้ำต่อแม้ key หมดอายุ

## 14. การปฏิบัติการและความต่อเนื่อง

เป้าหมายเริ่มต้นต้องยืนยันกับร้าน/โฮสติ้ง ไม่ใช่ผลทดสอบที่ทำได้แล้ว:
- RPO <= 15 นาที, RTO <= 4 ชั่วโมง
- full backup รายวัน + transaction/binlog สำหรับ point-in-time recovery พร้อมไฟล์แนบสัมพันธ์กัน
- restore drill ก่อนเปิดและอย่างน้อยทุกไตรมาส ตรวจ checksum/FK/ledger/เงิน/ไฟล์
- หลัง restore กระทบ provider/webhooks ใหม่ก่อนรับเงิน กันซ้ำและตกหล่น
- ทดสอบ 10 เครื่อง/50,000 SKU: search p95 <= 1 วินาที, internal finalize p95 <= 2 วินาที ไม่รวมบริการภายนอก
- monitor error/latency/locks/disk/backup age/queue age/failed print/paid-unfulfilled/stock mismatch พร้อมผู้รับผิดชอบและ runbook
- ไม่ใส่ข้อมูลผู้ป่วยเต็มในข้อความแจ้งเตือน

เมื่อขัดข้อง:
1. แสดง offline หยุดยืนยันขาย/รับเงินอัตโนมัติ ไม่แสดง cache ว่าเป็นยอดสด
2. ใช้เอกสารสำรองเลขควบคุมตาม SOP อนุมัติ เก็บยา ล็อต จำนวน ผู้จ่าย เงิน และข้อมูลจำเป็น
3. ไม่ข้ามประเมินหรือข้อจำกัดเพราะระบบล่ม หากประเมินไม่ได้ดำเนินตาม SOP
4. กลับมาแล้วลงย้อนหลังด้วยเลขเอกสารเดิม แยก occurred_at/posted_at ตรวจซ้ำและกระทบยอด
5. เพิ่ม offline เต็มรูปแบบต้องออกแบบ device identity/stock quota/conflict resolution/payment constraints/ข้อมูลบนเครื่องก่อน

## 15. ย้ายข้อมูลและนำขึ้นใช้

MIG-01: ตรวจ SKU/barcode ซ้ำ สารสำคัญ หน่วย ล็อต expiry จำนวน ต้นทุน ผู้ป่วย ก่อนนำเข้า
MIG-02: ไม่ชัดเข้า staging/review ไม่ตั้ง default ที่ทำให้ผ่านตรวจผิดความหมาย
MIG-03: ยอดเปิดผ่าน OPENING movements มีอนุมัติ กระทบกับนับจริง/ต้นทุนเปิด
MIG-04: dry run migration พร้อม rollback/forward-fix plan และ backup ก่อน cutover
MIG-05: ฝึกผู้ใช้ ทดสอบเครื่องจริง ภาษาไทย และกะขายครบวงจร
MIG-06: pilot จำกัดขอบเขต ติดตาม reconciliation/stock mismatch รายวันช่วงแรก

## 16. เกณฑ์ทดสอบและตรวจรับ

รายการนี้เป็นแผนทดสอบ ยังไม่ได้รัน ต้องบันทึกผล หลักฐาน ผู้ทดสอบ และเวอร์ชัน

| รหัส/ข้อกำหนด | สถานการณ์ | ผลที่ต้องได้ |
|---|---|---|
| T01 INV-01 | สองเครื่องซื้อหน่วยสุดท้าย | ไม่ขายเกิน/ไม่ติดลบ |
| T02 INV-07/API-01 | key/payload เดิมซ้ำ และ payload ต่าง | ครั้งเดียว หรือ conflict ตามกรณี |
| T03 SALE-07 | เปลี่ยนยา/จำนวน/ผู้ป่วย | ผลตรวจเก่า finalize ไม่ได้ |
| T04 หัวข้อ 6 | ล้มเหลวหลังลด stock ก่อนบิล | rollback ทั้งหมด |
| T05 INV-04 | ขาย 12 จากล็อตก่อน 8 ถัดไป 4 | allocations/movements ตรง |
| T06 หัวข้อ 3 | 0/ติดลบ/precision เกิน/หน่วยผิด/ID ไม่พบ | ปฏิเสธไม่เปลี่ยนข้อมูล |
| T07 CLI-02/07 | null allergy/สูตรผสม/unmatched | ไม่ crash และ coverage ถูก |
| T08 CLI-03/14 | knowledge ว่าง/ล่ม/ไม่ทราบประวัติ | ไม่แสดงปลอดภัย/ผ่านอัตโนมัติ |
| T09 REC-01 | recall แข่ง finalize | หลังบล็อกไม่จ่ายใหม่ ตามบิลก่อนบล็อกได้ |
| T10 หัวข้อ 3 | expiry DAY/MONTH ขอบเขตวัน Bangkok | ตรง policy version |
| T11 PAY-03 | webhook ซ้ำ/สลับ/signature ผิด/ยอดผิด | ไม่ยืนยันผิดหรือซ้ำ |
| T12 PAY-06/07 | รับเงินแต่ DB ล่ม/จองหมดอายุ | recover/refund ไม่เก็บซ้ำ |
| T13 PAY-08 | ยกเลิกหลังรับเงิน | ไม่ลบภาระคืนเงิน |
| T14 RET-01 | คืนบางส่วนพร้อมกัน | ไม่คืนสินค้า/เงินเกิน |
| T15 RET-03 | รับคืนสินค้า | quarantine ไม่เพิ่ม available เอง |
| T16 PRN-03/06 | ยาว/ไทย/กระดาษหมด/timeout | อ่านครบ reprint ไม่ขายซ้ำ |
| T17 BAR-04 | IME/ต่างหน่วย/ศูนย์นำหน้า/สแกนซ้ำ | resolve ถูก ไม่รบกวนข้อความ |
| T18 REG-06 | เปลี่ยน master/กฎ | รายงานเก่าคงเดิม แก้ผ่าน revision |
| T19 REG-02 | ซื้อ/ควบคุมพิเศษ/อันตรายเฉพาะรายการ/ใบสั่ง | แบบถูกตาม mapping อนุมัติ |
| T20 SEC-01 | cashier เรียกสิทธิ์เภสัชกร/เดา ID/ข้ามสาขา/ไฟล์ | ปฏิเสธ |
| T21 INV-14 | ขายระหว่างนับ | ไม่ทับ movement ใหม่ |
| T22 PUR-04 | รับบางส่วน/ใบรับซ้ำ | stock/cost/PO ถูก |
| T23 PAY-11 | แบ่งจ่าย/เงินทอน/คืนเงิน/ปิดกะ | cash กระทบได้ |
| T24 INV-03 | ledger ทุก lot/location/condition | เท่า balance/allocation |
| T25 หัวข้อ 14 | restore DB+files | ผ่าน RPO/RTO และ reconcile provider |
| T26 API-05 | worker ซ้ำ/ล่ม | ไม่ลงบัญชีซ้ำ แก้งานค้างได้ |
| T27 หัวข้อ 14 | load test | ผ่าน p95 ไม่ oversell |
| T28 PRIV-03/04 | ขอแก้/ลบที่ติด retention/hold | ไม่ลบหลักฐานผิดเงื่อนไข |
| T29 INV-05 | lot/package คนละสินค้า | DB/API ปฏิเสธ |
| T30 CLI-12 | patient/knowledge version เปลี่ยน | ตรวจใหม่ตามนโยบาย |

เงื่อนไขเปิดใช้: T01-T30 ผ่านตามขอบเขต ไม่มีข้อบกพร่องวิกฤตเรื่องผู้ป่วย/เงิน/สต็อก/สิทธิ์/กู้คืน; เภสัชกรทวน rules/ฉลาก/SOP; ผู้รับผิดชอบกำกับทวนแบบ/retention; ผู้รับผิดชอบข้อมูลทวน privacy; เจ้าของร้านรับรองนโยบายธุรกิจ/กู้คืน

## 17. แผนพัฒนาและสิ่งส่งมอบ

A: data dictionary, ERD, migrations, roles, master, transaction/idempotency framework
B: purchasing/receiving/units/ledger/FEFO/count/quarantine/recall
C: POS/payment/reconciliation/returns/refunds/shift/printing
D: patient/prescription/clinical/regulatory/GPP evidence/privacy
E: hardware/UAT/load/concurrency/restore/migration rehearsal/pilot
ออกแบบสัญญาระหว่างโมดูลตั้งแต่ต้น ห้ามเปิด production โดยขาด clinical/security ที่จำเป็น

ก่อนพัฒนาโมดูล: field-level dictionary, migration, API schemas, state transitions, UI/error states, tests เชื่อม requirement IDs
ก่อนเปิด: test evidence, restore report, approved mappings/templates, SOP, training, คู่มือผู้ดูแล

## 18. รายการต้องยืนยันก่อนเปิดจริง

DEC-01 เจ้าของร้าน: ใบอนุญาต กลุ่มสินค้า เครื่อง/สาขา การเชื่อมต่อ
DEC-02 เภสัชกร: expiry policy, minimum remaining shelf life, quantity steps, clinical sources/coverage/manual review
DEC-03 การเงิน: provider/merchant, ตรวจ PromptPay, refund, ภาษี/ปัดเศษ/ต้นทุน
DEC-04 ผู้รับผิดชอบกำกับ: แบบจริง รายการยา ลงนาม ระยะเก็บ กฎเฉพาะ
DEC-05 ผู้ดูแล: hosting/software versions/hardware/backup/RPO/RTO/ผู้รับแจ้งเหตุ
DEC-06 ผู้รับผิดชอบข้อมูล: notice/lawful bases/retention/contracts/incident procedure
เป็นเงื่อนไขตั้งค่าก่อนเปิด ไม่ใช่การอ้างว่าข้อกำหนดกฎหมายหรือคลินิกได้รับการยืนยันแล้ว

## 19. แหล่งอ้างอิงและขอบเขตตรวจสอบ

[S1] กองยา อย. รายการแบบฟอร์มสถานประกอบการ หน้าที่แสดง ข.ย.9-13
https://drug.fda.moph.go.th/information-licensing-lic/category/lic6?page=2

[S2] กองยา อย. การตรวจประเมินวิธีปฏิบัติทางเภสัชกรรมชุมชนสำหรับร้านขายยาแผนปัจจุบัน (ข.ย.1)
https://drug.fda.moph.go.th/manual-establishment-lic/gpp-1

เข้าถึง 2026-10-02 ตรวจชื่อ/ประเภทแบบฟอร์มจากหน้าเว็บ ไม่ได้รับรองการตรวจทุกประกาศหรือทุกช่องเอกสารแนบ
สถาปัตยกรรม นโยบายเริ่มต้น และเกณฑ์ทดสอบเป็นข้อเสนอออกแบบ ต้องทวนสอบระหว่างพัฒนาและตรวจรับ

## 20. การเปลี่ยนแปลงจากต้นฉบับ

- เปลี่ยนตัวอย่างแยกส่วนเป็นวงจรธุรกิจ พร้อม invariants/เกณฑ์ตรวจรับ
- แยก sale item/หลายล็อต เพิ่ม ledger หน่วย ต้นทุน รับเข้า คืน กักกัน เรียกคืน
- รวม transaction บิล/สต็อก เพิ่ม idempotency/reservations/outbox/payment recovery
- เลิก isSafe จาก alerts ว่าง เพิ่ม coverage/knowledge version/เภสัชกรทบทวน
- แก้ประเภท ข.ย.10/11 เพิ่ม versioned report mappings
- เพิ่มสิทธิ์ audit privacy printing backup/restore downtime แผนนำขึ้นใช้
- เก็บต้นฉบับ drugstore.original.txt ตัวอย่างโค้ดเดิมไม่ใช่ implementation ผ่านตรวจรับ
