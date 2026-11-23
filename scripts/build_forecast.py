#!/usr/bin/env python3
"""Download NOAA/ECMWF winds for a transparent *trajectory screening*.

NOT a model of plume rise, dispersion, lead concentrations or deposition.
All upstream values retained with source timestamp. No fabricated fallbacks.
API docs: https://open-meteo.com/en/docs/gfs-api and /docs/ecmwf-api
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'forecast.json'
START,END='2026-11-25','2026-11-26'
LEVELS=('10m','80m','925hPa','850hPa')
LATS=[round(38.2+.55*i,5) for i in range(9)]
LONS=[round(-95.0+.8*i,5) for i in range(9)]
MODEL_LEVELS={
 'gfs':LEVELS,
 'rrfs':LEVELS,
 # ECMWF's IFS 0.25-degree pressure-level model has 10 m winds but not 80 m.
 'ecmwf':('10m','925hPa','850hPa'),
}
def wind_variables(levels):
    return [f'wind_{kind}_{level}' for level in levels for kind in ('speed','direction')]

MODELS=[
 ('gfs','NOAA GFS','https://api.open-meteo.com/v1/gfs','ncep_gfs_global'),
 ('rrfs','NOAA RRFS CONUS','https://api.open-meteo.com/v1/gfs','ncep_rrfs_conus'),
 ('ecmwf','ECMWF IFS 0.25°','https://api.open-meteo.com/v1/ecmwf','ecmwf_ifs025'),
]

def get_json(url,attempts=3):
    for attempt in range(attempts):
        try:
            req=Request(url,headers={'User-Agent':'iowa-plume-watch/1.0 public-research', 'Accept':'application/json'})
            with urlopen(req,timeout=35) as response:
                obj=json.loads(response.read(15_000_000))
            if isinstance(obj,dict) and obj.get('error'):
                raise ValueError(obj.get('reason','Provider error'))
            return obj
        except (HTTPError,URLError,TimeoutError,ValueError,json.JSONDecodeError) as error:
            if attempt==attempts-1:raise RuntimeError(f'Upstream request failed: {error}') from error
            time.sleep(1.5*(attempt+1))

def validate_location(location,levels=LEVELS):
    hourly=location.get('hourly') or {}
    times=hourly.get('time')
    if not isinstance(times,list) or len(times)<25 or times!=sorted(times) or len(times)!=len(set(times)):
        raise ValueError('Invalid or incomplete hourly time series')
    if f'{START}T12:00' not in times or f'{END}T06:00' not in times:
        raise ValueError('Missing intended scenario window')
    for level in levels:
        speed=hourly.get(f'wind_speed_{level}')
        direction=hourly.get(f'wind_direction_{level}')
        if not isinstance(speed,list) or not isinstance(direction,list) or len(speed)!=len(times) or len(direction)!=len(times):
            raise ValueError(f'Pressure level or surface winds unavailable: {level}')
        for s,d in zip(speed,direction):
            if s is not None and (not isinstance(s,(int,float)) or not math.isfinite(s) or s<0):raise ValueError('Bad speed')
            if d is not None and (not isinstance(d,(int,float)) or not math.isfinite(d) or not 0<=d<=360):raise ValueError('Bad direction')
    return times

def load_model(key,title,endpoint,model_id):
    coords=[(lat,lon) for lat in LATS for lon in LONS]
    levels=MODEL_LEVELS[key]
    variables=wind_variables(levels)
    locations=[]
    # Batch coordinates instead of making 81 simultaneous API calls.
    for start in range(0,len(coords),9):
        chunk=coords[start:start+9]
        params={
          'latitude':','.join(str(lat) for lat,_ in chunk),
          'longitude':','.join(str(lon) for _,lon in chunk),
          'hourly':','.join(variables),'models':model_id,
          'start_date':START,'end_date':END,
          'wind_speed_unit':'kmh','timezone':'America/Chicago',
          'cell_selection':'nearest',
        }
        result=get_json(endpoint+'?'+urlencode(params))
        batch=result if isinstance(result,list) else [result]
        if len(batch)!=len(chunk):raise ValueError(f'Expected {len(chunk)} locations; received {len(batch)}')
        for loc,(lat,lon) in zip(batch,chunk):
            validate_location(loc,levels)
            locations.append({'requested_lat':lat,'requested_lon':lon,'hourly':{
              'time':loc['hourly']['time'],
              **{v:loc['hourly'][v] for v in variables}
            }})
        time.sleep(.2)
    times=locations[0]['hourly']['time']
    if any(loc['hourly']['time']!=times for loc in locations):raise ValueError('Inconsistent weather time axes')
    return {'name':title,'model_id':model_id,'provider':'Open-Meteo',
       'endpoint':endpoint,'available_levels':list(levels),'fetched_at_utc':datetime.now(timezone.utc).isoformat(timespec='seconds'),
       'grid':{'lats':LATS,'lons':LONS},'locations':locations,
       'time_start':times[0],'time_end':times[-1]}

def main(argv=None):
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=OUT)
    parser.add_argument('--offline',action='store_true',help='Inspect existing snapshot without network')
    args=parser.parse_args(argv)
    if args.offline:
        data=json.loads(args.output.read_text());print('status=',data.get('status'),'models=',list(data.get('models',{})));return 0
    now=datetime.now(timezone.utc)
    if now.date().isoformat()>END:
        print('Event window has passed; preserve the last snapshot as a dated archive.');return 0
    successful,errors={},{}
    for key,name,endpoint,model_id in MODELS:
        try:
            successful[key]=load_model(key,name,endpoint,model_id)
            print(f'OK {name}: {len(successful[key]["locations"])} sampled locations',flush=True)
        except Exception as exc:
            errors[key]=str(exc);print(f'ERROR {name}: {exc}',file=sys.stderr,flush=True)
    if not successful:
        print('No forecast models succeeded. Keeping previous snapshot and visible freshness timestamp.',file=sys.stderr)
        return 1
    data={'schema':1,'status':'forecast','event_date':START,'timezone':'America/Chicago',
          'fetched_at_utc':now.isoformat(timespec='seconds'),
          'description':'Fixed-level 2D trajectory screening; no validated dispersion, deposition or exposure estimate',
          'levels':list(LEVELS),'models':successful,'provider_errors':errors,
          'data_sources':['https://open-meteo.com/en/docs/gfs-api','https://open-meteo.com/en/docs/ecmwf-api']}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    tmp=args.output.with_suffix('.tmp')
    tmp.write_text(json.dumps(data,separators=(',',':'))+'\n',encoding='utf-8')
    tmp.replace(args.output)
    print('Wrote verified forecast snapshot to',args.output)
    return 0
if __name__=='__main__':sys.exit(main())
