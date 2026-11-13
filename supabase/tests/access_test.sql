-- Access and separation-of-duties checks. Runs inside a transaction and rolls back,
-- so it never changes data. Every row should read BLOCKED except the four marked "allowed".
begin;
create temp table t(n serial, step text, expected text, result text);
do $$
declare res text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-te'))::text, true);
  begin res := approve_rec('REC-3214552-3-LHR','3214552-3','LHR',4); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Technician approves a reorder','blocked',res);
  begin res := raise_request('3214552-3','LHR','AVL-02','WO-1','AOG'); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('SIN technician requests for LHR','blocked',res);

  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-op2'))::text, true);
  begin res := ingest('{"type":"TRANSFER_OUT","item":"BK-10406","pn":"2C1185-04","qty":1,"from":"LHR","to":"SIN"}')::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('SIN operator moves LHR stock','blocked',res);
  begin res := ingest('{"type":"TRANSFER_IN","trf":"TRF-0417","pn":"3214552-3"}')::text; exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('SIN operator confirms the pump','allowed',res);

  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-pm'))::text, true);
  begin res := approve_rec('REC-AD-822410-LHR','AD-822410','LHR',2); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Procurement approves before the Planner','blocked',res);

  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-pl'))::text, true);
  begin res := approve_rec('REC-AD-822410-LHR','AD-822410','LHR',2); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Planner first approval','allowed',res);
  begin res := approve_rec('REC-AD-822410-LHR','AD-822410','LHR',2); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Planner approves twice','blocked',res);

  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-pm'))::text, true);
  begin res := approve_rec('REC-AD-822410-LHR','AD-822410','LHR',2); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Procurement second approval','allowed',res);

  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-ad'))::text, true);
  begin res := approve_rec('REC-WB-5520-3-SIN','WB-5520-3','SIN',3); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Admin approves spend','blocked',res);

  perform set_config('request.jwt.claims', json_build_object('sub', (select id from profiles where handle='u-su'))::text, true);
  begin res := supplier_po('PO-7004','accept'); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Supplier accepts its own order','allowed',res);
  begin res := supplier_po((select id from pos where sup='SUP-2' and status='Sent' limit 1),'accept'); exception when others then res := 'BLOCKED: '||sqlerrm; end;
  insert into t(step,expected,result) values ('Supplier accepts another supplier''s order','blocked',res);
end $$;
select step, expected, result,
  case when (expected = 'blocked') = (result like 'BLOCKED%') then 'PASS' else 'FAIL' end as outcome
from t order by n;
rollback;
