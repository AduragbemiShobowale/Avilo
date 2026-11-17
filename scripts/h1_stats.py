import csv,sys,json,statistics as st,math
def load(p,col):
    v=[];n=0
    for r in csv.DictReader(open(p)):
        n+=1
        if r.get(col) not in (None,''): v.append(float(r[col]))
    return n,v
out={}
for name,p,col in [('in_app',sys.argv[1]+'/h1_latency_inapp.csv','visible_ms'),('cross_user',sys.argv[1]+'/h1_latency_cross_user.csv','seen_by_other_user_ms')]:
    n,v=load(p,col); _,w=load(p,'write_ms'); v.sort()
    q=lambda x: v[min(len(v)-1,math.ceil(x*len(v))-1)]
    m=st.mean(v); sd=st.stdev(v); ci=1.96*sd/math.sqrt(len(v))
    out[name]=dict(sent=n,measured=len(v),lost=n-len(v),mean_s=m/1000,sd_s=sd/1000,ci95_s=[(m-ci)/1000,(m+ci)/1000],median_s=q(.5)/1000,p95_s=q(.95)/1000,max_s=v[-1]/1000,within_5s=sum(x<=5000 for x in v)/n,write_mean_s=st.mean(w)/1000)
print(json.dumps(out,indent=1))
