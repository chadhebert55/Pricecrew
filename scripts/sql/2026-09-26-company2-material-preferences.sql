-- Bounded company-approved mappings from the user's reviewed Northeast examples.
-- Source: import 5, HERBERT_PRC_FIL - HERBERT_PRC_FIL.csv, effective 2026-08-25.
-- Does not rewrite import history, saved quotes, source identities or other tenants.
-- NM compatibility: https://www.aifittings.com/reference/files/pdf/charts/nm-cable-ranges.pdf
-- RD-42 deliberately has NO automatic family preference: new-work mounting suitability
-- is not collected by the appliance assembly and needs company/field selection.
WITH approved(sku,manufacturer,part,description,category,preferences) AS (
 VALUES
 ('13845','Arlington','NM94','Arlington NM94 plastic NM cable connector','Connectors',
  '[{"requestKey":"NM cable connector for 14/2 NM-B","kind":"family"},{"requestKey":"NM cable connector for 12/2 NM-B","kind":"family"},{"requestKey":"NM cable connector for 10/2 NM-B","kind":"family"}]'::jsonb),
 ('29311','Arlington','NM95','Arlington NM95 3/4 NM cable connector','Connectors',
  '[{"requestKey":"NM cable connector for 14/3 NM-B","kind":"family"},{"requestKey":"NM cable connector for 12/3 NM-B","kind":"family"},{"requestKey":"NM cable connector for 10/3 NM-B","kind":"family"},{"requestKey":"NM cable connector for 8/3 NM-B","kind":"family"},{"requestKey":"NM cable connector for 6/3 NM-B","kind":"family"}]'::jsonb),
 ('257230','Allied Moulded','RD-42','Allied RD-42 fiberglass range/dryer receptacle box','Boxes','[]'::jsonb)
), source AS (
 SELECT a.*, r->'incoming' AS incoming
 FROM approved a JOIN price_book_imports i ON i.id=5 AND i.company_id=2
 CROSS JOIN LATERAL jsonb_array_elements(i.rows) r
 WHERE r->'incoming'->>'supplierSku'=a.sku AND r->'incoming'->>'unit'='c'
)
INSERT INTO price_book_items(company_id,category,item,unit,unit_cost,supplier,manufacturer,
 manufacturer_part_number,supplier_sku,upc,source_date,is_default,is_contractor_owned,
 supplier_cost,supplier_uom,normalized_unit,normalized_unit_cost,supplier_unit_quantity,material_preferences)
SELECT 2,category,description,'ea',(incoming->>'unitCost')::numeric/100,'Northeast Electrical',
 manufacturer,part,sku,incoming->>'upc',incoming->>'sourceDate',false,false,
 (incoming->>'unitCost')::numeric,'c','ea',(incoming->>'unitCost')::numeric/100,100,preferences
FROM source s WHERE NOT EXISTS (
 SELECT 1 FROM price_book_items p WHERE p.company_id=2 AND p.supplier='Northeast Electrical' AND p.supplier_sku=s.sku
);

WITH preferences(sku,request_key) AS (VALUES
 ('243085','Pass & Seymour 3232-TRW 15A TR duplex receptacle'),
 ('942105','Siemens 20A 1-pole Dual Function breaker'),
 ('1098885','Siemens 20A 1-pole GFCI breaker'))
UPDATE price_book_items p
SET supplier_cost=p.unit_cost,supplier_uom='ea',normalized_unit='ea',
 normalized_unit_cost=p.unit_cost,supplier_unit_quantity=1,
 material_preferences=p.material_preferences || jsonb_build_array(jsonb_build_object('requestKey',v.request_key,'kind','exact'))
FROM preferences v
WHERE p.company_id=2 AND p.supplier='Northeast Electrical' AND p.supplier_sku=v.sku
 AND p.unit='ea' AND p.unit_cost>0 AND NOT p.is_default AND NOT p.is_contractor_owned
 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p.material_preferences) pref WHERE pref->>'requestKey'=v.request_key);
