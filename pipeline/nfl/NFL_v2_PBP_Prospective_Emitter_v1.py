#!/usr/bin/env python3
from __future__ import annotations
import argparse, hashlib, json, sys
from collections import defaultdict
from pathlib import Path
import numpy as np, pandas as pd
sys.path.insert(0, str(Path(__file__).parent))
import build_nfl_pbp_features_v2 as frozen_builder

VERSION='NFL v2 PBP Prospective Emitter v1.0'

def sha256(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for ch in iter(lambda:f.read(1024*1024),b''):h.update(ch)
    return h.hexdigest()

def load_csv_auto(path):
    p=str(path)
    return pd.read_csv(path,compression='gzip' if '.gz' in p else 'infer')

def make_exact_pre2026_qb_seed(games, current_qs, archived_2026_pregame):
    g=games.copy();g['gameday_dt']=pd.to_datetime(g['gameday'])
    order=g[g.season==2026][['game_id','gameday_dt']].sort_values(['gameday_dt','game_id']).reset_index(drop=True)
    order['ord']=range(len(order))
    q=current_qs.merge(order,on='game_id',how='left')
    p=archived_2026_pregame.merge(order,on='game_id',how='left').sort_values(['ord','game_id'])
    seed={}
    valid=p.dropna(subset=['qb_last_id_pre','qb_prev_primary_cum_dropbacks_pre'])
    for qid,rr in valid.groupby(valid['qb_last_id_pre'].astype(str)):
        r=rr.iloc[0]; db=float(r['qb_prev_primary_cum_dropbacks_pre']); es=float(r['qb_prev_primary_cum_epadb_pre'])*db; cutoff=r['ord']
        prior=q[(q['passer_player_id'].astype(str)==qid)&(q['ord']<cutoff)]
        db0=db-pd.to_numeric(prior['dropbacks'],errors='coerce').fillna(0).sum()
        es0=es-pd.to_numeric(prior['qb_epa_sum'],errors='coerce').fillna(0).sum()
        seed[qid]=(float(es0),int(round(db0)))
    return seed

def emit(games,historical_agg,current_agg,current_qs,archived_2026_pregame,target_ids):
    B=frozen_builder
    g=games.copy();g['gameday_dt']=pd.to_datetime(g['gameday'])
    gm=g[['game_id','season','week','gameday_dt','home_team','away_team']].rename(columns={'gameday_dt':'gameday'}).copy()
    hist_agg=historical_agg.drop(columns=['season_source'],errors='ignore')
    agg=pd.concat([hist_agg,current_agg],ignore_index=True)
    a=agg.merge(gm,on='game_id',how='inner');ab={k:v for k,v in a.groupby('game_id')}
    qb={k:v for k,v in current_qs.merge(gm[['game_id','gameday']],on='game_id',how='inner').groupby('game_id')}
    seed=make_exact_pre2026_qb_seed(g,current_qs,archived_2026_pregame)
    hist=defaultdict(lambda:defaultdict(list));sh=defaultdict(lambda:defaultdict(lambda:defaultdict(list)))
    ew=defaultdict(dict);qhist=defaultdict(list);pep=defaultdict(float);pdb=defaultdict(int);rows=[]
    for _,gg in gm[gm.season<=2025].sort_values(['gameday','game_id']).iterrows():
        gid=gg.game_id
        if gid not in ab: continue
        rr=ab[gid]
        for _,r in rr.iterrows():
            t=r.team;season=int(gg.season)
            for m in B.METRICS:
                v=r.get(m,np.nan);hist[t][m].append(v);sh[t][season][m].append(v)
                if pd.notna(v):ew[t][m]=float(v) if m not in ew[t] else .25*float(v)+.75*ew[t][m]
            qhist[t].append(r.get('post_primary_qb_id'));hist[t]['post_primary_qb_epadb'].append(r.get('post_primary_qb_epadb',np.nan))
    for qid,(es,db) in seed.items():pep[qid]=es;pdb[qid]=db
    for _,gg in gm[gm.season==2026].sort_values(['gameday','game_id']).iterrows():
        gid=gg.game_id
        if gid in target_ids:
            for t in [gg.home_team,gg.away_team]:
                season=int(gg.season);o={'game_id':gid,'team':t}
                for m in B.METRICS:
                    vals=hist[t][m];sv=sh[t][season][m]
                    o[f'{m}_season_pre']=np.nanmean(sv) if len(sv) else np.nan
                    for w in (3,5,8):o[f'{m}_{w}_pre']=np.nanmean(vals[-w:]) if len(vals) else np.nan
                    o[f'{m}_ewma_pre']=ew[t].get(m,np.nan)
                pq=qhist[t][-1] if qhist[t] else None;o['qb_last_id_pre']=pq
                o['qb_last_game_epadb_pre']=hist[t]['post_primary_qb_epadb'][-1] if qhist[t] else np.nan
                o['qb_prev_primary_cum_epadb_pre']=pep[pq]/pdb[pq] if pq and pdb[pq] else np.nan
                o['qb_prev_primary_cum_dropbacks_pre']=float(pdb[pq]) if pq and pdb[pq] else np.nan
                last=[x for x in qhist[t][-3:] if pd.notna(x)];o['qb_unique_last3_pre']=float(len(set(last))) if last else np.nan
                o['qb_same_last2_pre']=float(len(qhist[t])>=2 and qhist[t][-1]==qhist[t][-2] and pd.notna(qhist[t][-1]))
                rows.append(o)
            continue
        if gid not in ab: continue
        rr=ab[gid]
        for _,r in rr.iterrows():
            t=r.team;season=int(gg.season)
            for m in B.METRICS:
                v=r.get(m,np.nan);hist[t][m].append(v);sh[t][season][m].append(v)
                if pd.notna(v):ew[t][m]=float(v) if m not in ew[t] else .25*float(v)+.75*ew[t][m]
            qhist[t].append(r.get('post_primary_qb_id'));hist[t]['post_primary_qb_epadb'].append(r.get('post_primary_qb_epadb',np.nan))
        if gid in qb:
            for _,r in qb[gid].iterrows():
                if pd.notna(r.passer_player_id):pep[r.passer_player_id]+=float(r.qb_epa_sum);pdb[r.passer_player_id]+=int(r.dropbacks)
    out=pd.DataFrame(rows)
    expected=2*len(target_ids)
    if len(out)!=expected or out[['game_id','team']].duplicated().any():raise RuntimeError(f'target team-row coverage failure: {len(out)} != {expected}')
    return out

def main():
    ap=argparse.ArgumentParser()
    for x in ['games','historical-agg','current-pbp','archived-2026-pregame','target-ids','output','manifest']:ap.add_argument('--'+x,required=True)
    a=ap.parse_args(); B=frozen_builder
    games=load_csv_auto(a.games); hist=load_csv_auto(a.historical_agg); pbp=pd.read_csv(a.current_pbp,compression='gzip',usecols=lambda c:c in B.PBP_COLS); archived=load_csv_auto(a.archived_2026_pregame)
    agg,qs=B.aggregate(pbp); targets=[x.strip() for x in Path(a.target_ids).read_text().splitlines() if x.strip()]
    out=emit(games,hist,agg,qs,archived,set(targets)); Path(a.output).parent.mkdir(parents=True,exist_ok=True);out.to_csv(a.output,index=False,compression='gzip')
    m={'emitter':VERSION,'frozen_builder_sha256':sha256(Path(B.__file__)),'current_pbp_sha256':sha256(Path(a.current_pbp)),'historical_agg_sha256':sha256(Path(a.historical_agg)),'archived_2026_pregame_sha256':sha256(Path(a.archived_2026_pregame)),'target_games':len(targets),'team_rows':len(out),'columns':len(out.columns),'no_target_update':True,'output_sha256':sha256(Path(a.output))}
    Path(a.manifest).write_text(json.dumps(m,indent=2))
if __name__=='__main__':main()
