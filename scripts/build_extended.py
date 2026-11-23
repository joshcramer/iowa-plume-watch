#!/usr/bin/env python3
"""48-hour screening paths from Open-Meteo forecast winds (NO plume or deposition modeling).

The 9x9 local grid in data/forecast.json is used near the site, with a coarse
2-degree regional wind grid temporarily fetched for GFS/ECMWF when a path
leaves Iowa. Forecast sources may fail or end; paths terminate, never extrapolate.
These air-parcel paths cannot establish exposure, lead concentration, or safety.
"""
from datetime import datetime, timedelta, timezone
import json, math, sys, time
from pathlib import Path
from urllib.parse import urlencode
import build_forecast as original

ROOT=Path(__file__).resolve().parents[1]
EVENT=datetime(2026,11,25)
RELEASES=(9,12,15)
FAR_LATS=list(range(27,52,2))
FAR_LONS=list(range(-105,-68,2))
SITE=(40.825518,-91.266502)
OUT=ROOT/'data'/'extended-tracks.json'
DELTA=.25

def vector(speed, direction):
    if speed is None or direction is None: return None
    if not all(isinstance(v,(int,float)) and math.isfinite(v) for v in (speed,direction)): return None
    if speed<0: return None
    d=math.radians(direction)
    return -speed*math.sin(d), -speed*math.cos(d)

def bracket(values, x):
    if x<values[0] or x>values[-1]: return None
    for i in range(len(values)-1):
        if values[i]<=x<=values[i+1]:return i,(x-values[i])/(values[i+1]-values[i])
    return None

def wind(grid, point, level, moment):
    if not grid:return None
    lat,lon=point
    left=bracket(grid['grid']['lats'],lat)
    right=bracket(grid['grid']['lons'],lon)
    if left is None or right is None:return None
    i,fy=left;j,fx=right
    hourly0=grid['locations'][0]['hourly']
    clock=moment.strftime('%Y-%m-%dT%H:00')
    try:hour=hourly0['time'].index(clock)
    except ValueError:return None
    frac=moment.minute/60+moment.second/3600
    if hour+1>=len(hourly0['time']):return None
    width=len(grid['grid']['lons'])
    indexes=(i*width+j,i*width+j+1,(i+1)*width+j,(i+1)*width+j+1)
    weights=((1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy)
    result=[0.,0.]
    for index,weight in zip(indexes,weights):
        data=grid['locations'][index]['hourly']
        s,d=data.get('wind_speed_'+level),data.get('wind_direction_'+level)
        if s is None or d is None or hour+1>=len(s) or hour+1>=len(d):return None
        a=vector(s[hour],d[hour]);b=vector(s[hour+1],d[hour+1])
        if a is None or b is None:return None
        result[0]+=weight*(a[0]*(1-frac)+b[0]*frac)
        result[1]+=weight*(a[1]*(1-frac)+b[1]*frac)
    return tuple(result)

def advance(pos,v,hours):
    lat,lon=pos
    return lat+v[1]*hours/111.195, lon+v[0]*hours/(111.195*max(.01,math.cos(math.radians(lat))))

def integrate(near,far,level,release,limit=48):
    pts=[{'lat':SITE[0],'lon':SITE[1],'h':0}]
    pos=SITE
    def sample(position,moment):
        # Use small grid for the more precise early positions, and coarse
        # regional winds only after that grid becomes unavailable.
        return wind(near,position,level,moment) or wind(far,position,level,moment)
    for step in range(round(limit/DELTA)):
        h=step*DELTA
        moment=EVENT+timedelta(hours=release+h)
        first=sample(pos,moment)
        if first is None:break
        midpoint=advance(pos,first,DELTA/2)
        second=sample(midpoint,moment+timedelta(hours=DELTA/2))
        if second is None:break
        pos=advance(pos,second,DELTA)
        if not all(math.isfinite(v) for v in pos):break
        pts.append({'lat':round(pos[0],6),'lon':round(pos[1],6),'h':round(h+DELTA,2)})
    reached=pts[-1]['h']
    return {'points':pts,'hours_reached':reached,'truncated':reached<limit,
            'reason':None if reached>=limit else f'Missing forecast or outside sampled region at +{reached:g}h'}

def regional_grid(key,endpoint,model_id):
    levels=original.MODEL_LEVELS[key]
    variables=original.wind_variables(levels)
    coords=[(lat,lon) for lat in FAR_LATS for lon in FAR_LONS]
    locations=[]
    for i in range(0,len(coords),12):
        batch=coords[i:i+12]
        query=urlencode({'latitude':','.join(str(a) for a,b in batch),
                         'longitude':','.join(str(b) for a,b in batch),
                         'hourly':','.join(variables),
                         'models':model_id,
                         'start_date':'2026-11-25','end_date':'2026-11-27',
                         'timezone':'America/Chicago','wind_speed_unit':'kmh',
                         'cell_selection':'nearest'})
        data=original.get_json(endpoint+'?'+query)
        data=data if isinstance(data,list) else [data]
        if len(data)!=len(batch):raise RuntimeError('Regional location count mismatch')
        for entry,(lat,lon) in zip(data,batch):
            hourly=entry.get('hourly') or {}
            times=hourly.get('time') or []
            if '2026-11-25T12:00' not in times or '2026-11-27T15:00' not in times:
                raise RuntimeError('Missing regional time axis for 48 hours')
            if any(len(hourly.get(v,[]))!=len(times) for v in variables):
                raise RuntimeError('Incomplete regional wind variables')
            locations.append({'requested_lat':lat,'requested_lon':lon,
                              'hourly':{'time':times,**{v:hourly[v] for v in variables}}})
        time.sleep(.5)
    return {'grid':{'lats':FAR_LATS,'lons':FAR_LONS},'locations':locations}

def main():
    original_data=json.loads((ROOT/'data'/'forecast.json').read_text())
    if original_data.get('status')!='forecast':return 1
    if datetime.now(timezone.utc).date()>datetime(2026,11,27).date():
        print('Event horizon passed. Keeping historical snapshot.')
        return 0
    far={}
    errors={}
    for key,name,endpoint,model_id in original.MODELS:
        if key not in ('gfs','ecmwf') or key not in original_data['models']:continue
        try:
            far[key]=regional_grid(key,endpoint,model_id)
            print('OK regional',key,len(far[key]['locations']),'weather points',flush=True)
        except Exception as exc:
            errors[key]=str(exc)
            print('UNAVAILABLE regional',key,str(exc),file=sys.stderr,flush=True)
    paths={}
    for key,near in original_data['models'].items():
        paths[key]={}
        for release in RELEASES:
            paths[key][str(release)]={}
            for level in near['available_levels']:
                paths[key][str(release)][level]=integrate(near,far.get(key),level,release)
    result={'schema':1,'status':'extended-trajectory',
            'event_date':'2026-11-25',
            'source_snapshot_utc':original_data['fetched_at_utc'],
            'generated_at_utc':datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'regional_grid':{'lats':FAR_LATS,'lons':FAR_LONS,'resolution_deg':2},
            'method':'15-minute RK2; fine-grid first; coarse 2-degree regional wind interpolation after leaving local grid; no vertical coupling, deposition or lead concentrations',
            'paths':paths,'provider_errors':errors,
            'data_sources':['https://open-meteo.com/en/docs/gfs-api',
                            'https://open-meteo.com/en/docs/ecmwf-api']}
    OUT.parent.mkdir(parents=True,exist_ok=True)
    temp=OUT.with_suffix('.tmp')
    temp.write_text(json.dumps(result,separators=(',',':'))+'\n')
    temp.replace(OUT)
    print('Wrote',OUT,'size',OUT.stat().st_size,'bytes',flush=True)
    return 0

if __name__=='__main__':sys.exit(main())
