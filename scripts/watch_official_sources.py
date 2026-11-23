#!/usr/bin/env python3
"""Conservative official-source change watch: DOES NOT interpret page changes.

This is a change detector, not a public-health alert or news classifier.
It ignores scripts, styles and whitespace; template changes may still trigger.
"""
import hashlib
from html.parser import HTMLParser
import json
from datetime import datetime,timezone
from pathlib import Path
import sys
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'data'/'source-watch.json'
SOURCES={
 'army':'https://www.army.mil/asc#org-iowa-army-ammunition-plant',
 'iowa-public-radio-2026-11-22':'https://www.iowapublicradio.org/ipr-news/2026-11-22/southeast-iowa-lead-azide-explosion-wednesday-army',
 'epa':'https://response.epa.gov/site/site_profile.aspx?site_id=17211',
 'iowa-hhs':'https://hhs.iowa.gov/health-prevention/environmental-health/lead-exposure-surveillance',
 'iowa-hsem':'https://homelandsecurity.iowa.gov/iowa-army-munitions-disposition-resources',
}
class TextOnly(HTMLParser):
    def __init__(self): super().__init__();self.skip=0;self.text=[]
    def handle_starttag(self,tag,attrs):
        if tag in ('script','style','noscript'):self.skip+=1
    def handle_endtag(self,tag):
        if tag in ('script','style','noscript'):self.skip=max(0,self.skip-1)
    def handle_data(self,text):
        if not self.skip:self.text.append(text)

def digest(html):
    p=TextOnly();p.feed(html)
    normalized=' '.join(' '.join(p.text).split())
    return hashlib.sha256(normalized.encode('utf-8')).hexdigest()

def main():
    previous=json.loads(OUT.read_text()) if OUT.exists() else {}
    old=previous.get('sources') or {}
    results={};changed=[];errors={}
    for key,url in SOURCES.items():
        try:
            req=Request(url.split('#')[0],headers={'User-Agent':'Mozilla/5.0 IowaPlumeWatch/1.0'})
            with urlopen(req,timeout=25) as r:
                raw=r.read(4_000_000)
            value=digest(raw.decode('utf-8','replace'))
            prior=old.get(key,{})
            if prior.get('sha256') and prior['sha256']!=value:
                changed.append(key)
            results[key]={'url':url,'sha256':value,'last_changed_at_utc': (
                datetime.now(timezone.utc).isoformat(timespec='seconds') if key in changed
                else prior.get('last_changed_at_utc')
            )}
        except Exception as exc:
            errors[key]=str(exc)
            if key in old:results[key]=old[key]
    output={'checked_at_utc':datetime.now(timezone.utc).isoformat(timespec='seconds'),
            'disclaimer':'Source-page change detection only. No editorial verification or public-health conclusions.',
            'sources':results,'changed_on_this_check':changed,'fetch_errors':errors}
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(output,indent=2)+'\n')
    print('Observed changed HTML text at:',', '.join(changed) or 'none','; errors=',len(errors))
    return 0 if len(errors)<len(SOURCES) else 1
if __name__=='__main__':sys.exit(main())
