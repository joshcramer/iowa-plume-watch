import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

P=Path(__file__).resolve().parents[1]/'scripts'/'build_forecast.py'
spec=importlib.util.spec_from_file_location('forecast',P)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class CollectorTests(unittest.TestCase):
    def sample(self):
        time=[f'2026-11-25T{i:02}:00' for i in range(24)] + [f'2026-11-26T{i:02}:00' for i in range(24)]
        h={'time':time}
        for lev in mod.LEVELS:
            h['wind_speed_'+lev]=[10.0]*48
            h['wind_direction_'+lev]=[30.0]*48
        return {'hourly':h}
    def test_validation(self):
        self.assertEqual(mod.validate_location(self.sample())[12],'2026-11-25T12:00')
    def test_rejects_missing_level(self):
        obj=self.sample();del obj['hourly']['wind_direction_850hPa']
        with self.assertRaises(ValueError):mod.validate_location(obj)
    def test_provider_batches_preserve_spatial_order(self):
        calls=[]
        def fake_http(url):
            from urllib.parse import urlparse,parse_qs
            params=parse_qs(urlparse(url).query)
            n=len(params['latitude'][0].split(','))
            calls.append(n)
            return [self.sample() for _ in range(n)]
        with patch.object(mod,'get_json',fake_http),patch.object(mod.time,'sleep',lambda _:None):
            result=mod.load_model('gfs','NOAA GFS','https://api.open-meteo.com/v1/gfs','ncep_gfs_global')
        self.assertEqual(len(result['locations']),81)
        self.assertEqual(len(calls),9)
        self.assertEqual(result['locations'][0]['requested_lat'],mod.LATS[0])
        self.assertEqual(result['locations'][0]['requested_lon'],mod.LONS[0])
        self.assertEqual(result['locations'][80]['requested_lon'],mod.LONS[-1])

if __name__=='__main__':unittest.main()
