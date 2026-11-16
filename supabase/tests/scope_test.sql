-- Checks for the features added in 0005: repair events, RFID gates, ERP import, supplier
-- notifications and the H1 probe. Runs in a transaction and rolls back, so it never changes data.
begin;
create temp table t(n serial, step text, expected text, result text);
do $$
declare res text; who uuid;
begin
  -- repair loop
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-op1'))::text, true);
  begin res := ingest('{"type":"REPAIR_OUT","item":"VH-10417","pn":"VT-622-0450","from":"LHR"}')::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('LHR operator sends a repairable unit for repair','allowed',res);
  insert into t(step,expected,result) values ('Unit is at the vendor with a repair order','allowed', (select cond || ' · ' || (repair->>'ro') from items where id='VH-10417'));
  begin res := ingest('{"type":"REPAIR_OUT","item":"BK-10406","pn":"2C1185-04","from":"LHR"}')::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Serviceable unit sent for repair','blocked',res);
  begin res := ingest('{"type":"REPAIR_IN","item":"VH-10417","pn":"VT-622-0450","to":"LHR","cert":"Form 1"}')::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Unit back from repair','allowed',res);
  insert into t(step,expected,result) values ('Repaired unit waits for inspection','allowed', (select cond from items where id='VH-10417'));
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-op2'))::text, true);
  begin res := ingest('{"type":"REPAIR_OUT","item":"ST-10416","pn":"3505986-12","from":"LHR"}')::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('SIN operator sends LHR stock to repair','blocked',res);

  -- RFID gates
  begin res := gate_read('LHR-DOCK-OUT','BK-10406'); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('SIN operator feeds the LHR gate','blocked',res);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-op1'))::text, true);
  begin res := gate_read('LHR-DOCK-OUT','BK-10406'); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Unit leaves LHR with no paperwork','allowed (exception)', res || ' · open exceptions ' || (select count(*) from exceptions where object='BK-10406' and status='Open'));
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-op2'))::text, true);
  begin res := gate_read('SIN-DOCK-IN', (select id from items where transit->>'to'='SIN' limit 1)); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Expected arrival read at SIN goods-in','allowed (auto receipt)', res);

  -- ERP import
  begin res := import_erp('x.csv','Navision','[{"pn":"EO-2380-QT","station":"LHR","qty":"5"},{"pn":"NOPE","station":"LHR","qty":"1"}]')::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Operator imports ERP records','blocked',res);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-pl'))::text, true);
  begin res := import_erp('x.csv','Navision','[{"pn":"EO-2380-QT","station":"LHR","qty":"5"},{"pn":"NOPE","station":"LHR","qty":"1"}]')::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Planner imports (1 good line, 1 bad)','allowed',res);

  -- supplier notifications
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-su'))::text, true);
  begin res := supplier_po('PO-7004','accept', (current_date + 12)); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Supplier confirms with a date','allowed',res);
  insert into t(step,expected,result) values ('Planner notified, acknowledgement stored','allowed',
    (select count(*) from notifications where object='PO-7004' and to_role='planner') || ' notice · ack ' || (select (acknowledged is not null)::text from pos where id='PO-7004'));
  begin res := supplier_po('PO-6513','accept'); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Halcyon confirms a Kestrel order','blocked',res);

  -- H1 probe
  begin res := h1_probe(1)::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Supplier runs the visibility probe','blocked',res);
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-sa'))::text, true);
  begin res := h1_probe(0)::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Avilo Support runs the probe','allowed',res);
  begin res := (seed_h1()->'lost')::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Avilo Support plants discrepancies','allowed',res);
end $$;
select n, step, expected, left(result, 110) as result from t order by n;
rollback;
