import json,sys
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from openpyxl.utils import get_column_letter
B=json.load(open(sys.argv[1])); OUT=sys.argv[2]
H=Font(bold=True,color='FFFFFF'); HF=PatternFill('solid',fgColor='0B2545')
def head(ws,cols,widths):
    for i,(c,w) in enumerate(zip(cols,widths),1):
        x=ws.cell(row=1,column=i,value=c); x.font=H; x.fill=HF; x.alignment=Alignment(wrap_text=True,vertical='center')
        ws.column_dimensions[get_column_letter(i)].width=w
    ws.freeze_panes='A2'
for k in ['A','B']:
    wb=Workbook(); ws=wb.active; ws.title='Read me'
    L=[("Manual method: stock spreadsheet and e-mail (Set %s)"%k,1),
      ("This workbook is the 'today' method for the H3 session. Do not open Avilo while you work in this method. Keep it in a shared online copy (Excel Online or Google Sheets) so both of you edit the same file.",0),("",0),
      ("Who does what",1),
      ("Person A: Supply Chain Planner and Compliance Officer.",0),
      ("Person B: Procurement Manager, Stores Operator, and both suppliers (Halcyon Aero Spares and Kestrel Rotables).",0),("",0),
      ("For every order card",1),
      ("1. Planner (A): find the part and station on the 'Stock' sheet. Order quantity = 'Order up to' minus 'On hand' (at least 1).",0),
      ("2. Planner (A): fill the next line of 'Purchase orders' (part, station, quantity, unit cost; value and approval column fill themselves).",0),
      ("3. Value USD 5,000 or more: Planner e-mails the Procurement Manager (B) with the approval template and waits for the reply 'Approved'. Below USD 5,000 the Planner's approval is enough.",0),
      ("4. Whoever gives the FINAL approval taps 'Order fully approved' on the timer screen.",0),
      ("5. Planner (A): e-mails the order to the supplier (B) with the order template.",0),
      ("6. Supplier (B): replies 'Confirmed, delivery by [date]' and taps 'Supplier confirmed' on the timer screen.",0),
      ("7. Supplier/Stores (B): the goods 'arrive'. Stores adds a line to 'Goods received' with any certificate number (e.g. FORM1-1234), adds the quantity to 'On hand' on the 'Stock' sheet, taps 'Delivery received', and e-mails Compliance (A): '[PO] received at [station], certificate [number], please inspect'.",0),
      ("8. Compliance (A): checks the certificate number in the e-mail matches the 'Goods received' line, fills a line in 'Certificates', and taps 'Released serviceable'. The order is finished.",0),("",0),
      ("E-mail templates (copy, fill the brackets)",1),
      ("Approval request. Subject: 'Approval needed: [PO]'. Body: 'Please approve [PO]: [qty] x [part] for [station], USD [value], supplier [supplier].'   Reply: 'Approved'.",0),
      ("Order. Subject: '[PO] [part number] x [qty]'. Body: 'Please supply [qty] x [part] (P/N [part number]) to [station]. Please confirm your delivery date.'   Reply: 'Confirmed, delivery by [date]'.",0),
      ("Inspection. Subject: '[PO] received, please inspect'. Body: '[PO] received at [station], certificate [number].'",0),("",0),
      ("Rules",1),
      ("Approval limit USD 5,000: at or above it the Procurement Manager approves after the Planner; below it the Planner alone.",0),
      ("Always buy from the supplier listed for the part. Never move stock between stations.",0),
      ("If something goes wrong, carry on and tap 'Note a problem' on the timer screen. The clock does not stop.",0)]
    for i,(t,b) in enumerate(L,1):
        c=ws.cell(row=i,column=1,value=t); c.alignment=Alignment(wrap_text=True)
        if b: c.font=Font(bold=True,size=12 if i==1 else 11)
    ws.column_dimensions['A'].width=130
    st=wb.create_sheet('Stock')
    head(st,['Part number','Part','Type','Station','On hand','Reorder point','Order up to','Unit','Unit cost (USD)','Supplier','Quoted lead (days)'],[14,30,11,9,9,12,11,6,13,24,11])
    rows=sorted(B[k],key=lambda r:(r['pn'],r['station']))
    for i,r in enumerate(rows,2):
        for j,v in enumerate([r['pn'],r['name'],r['type'],r['station'],r['onHand'],r['rop'],r['upTo'],r['unit'],r['cost'],r['sup'],r['lead']],1): st.cell(row=i,column=j,value=v)
    st.auto_filter.ref=f"A1:K{len(rows)+1}"
    op=wb.create_sheet('Open orders & transfers'); head(op,['What','Part number','Station','Quantity','Note'],[20,14,9,9,40])
    for o in B['onorder']: op.append(['Purchase order',o['pn'],o['station'],o['q'],'Ordered before the session'])
    for t in B['transit']: op.append(['Transfer in transit',t['pn'],t['st'],t['q'],'Overdue: not counted as stock' if t['od'] else 'On its way'])
    po=wb.create_sheet('Purchase orders')
    head(po,['PO number','Date/time','Part number','Part','Station','Quantity','Unit cost','Value (USD)','Supplier','Needs Procurement approval?','Approved by','Sent to supplier','Supplier confirmed date'],[11,16,14,26,9,9,10,12,22,14,14,14,16])
    for n in range(2,22):
        po.cell(row=n,column=1,value=f"PO-M{k}{n-1:02d}")
        po.cell(row=n,column=8,value=f'=IF(AND(F{n}<>"",G{n}<>""),F{n}*G{n},"")')
        po.cell(row=n,column=10,value=f'=IF(H{n}="","",IF(H{n}>=5000,"YES","no"))')
    gr=wb.create_sheet('Goods received'); head(gr,['Date/time','PO number','Part number','Station','Quantity','Certificate number','Received by'],[16,11,14,9,9,18,14])
    ce=wb.create_sheet('Certificates'); head(ce,['Date/time','PO number','Certificate number','Matches goods received? (Y/N)','Released by'],[16,11,18,16,14])
    wb.save(f"{OUT}/H3_manual_workbook_Set_{k}.xlsx")
print('ok')
