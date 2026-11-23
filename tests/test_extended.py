import importlib.util
from pathlib import Path
import sys
import unittest
from datetime import datetime
scripts=Path(__file__).resolve().parents[1]/'scripts'
sys.path.insert(0,str(scripts))
spec=importlib.util.spec_from_file_location('extended',scripts/'build_extended.py')
ext=importlib.util.module_from_spec(spec)
spec.loader.exec_module(ext)

def sample_field(speed=10):
    lats=[39,41,43];lons=[-94,-91,-88]
    hours=[f'2026-11-{day:02}T{hour:02}:00' for day in (25,26,27) for hour in range(24)]
    return {'grid':{'lats':lats,'lons':lons},
            'locations':[{'hourly':{'time':hours,
                    'wind_speed_10m':[speed]*72,'wind_direction_10m':[0]*72}}
                    for _ in range(9)]}
class RegionalTests(unittest.TestCase):
    def test_wind_from_north_goes_south(self):
        a,b=ext.vector(20,0)
        self.assertAlmostEqual(a,0);self.assertAlmostEqual(b,-20)
    def test_time_interpolation(self):
        a,b=ext.wind(sample_field(),ext.SITE,'10m',datetime(2026,11,25,12,30))
        self.assertAlmostEqual(a,0);self.assertAlmostEqual(b,-10)
    def test_tracks_truncate_without_winds(self):
        result=ext.integrate(sample_field(),None,'10m',12)
        self.assertTrue(result['truncated'])
        self.assertLess(result['hours_reached'],48)
    def test_full_48h_no_wind_with_sufficient_time(self):
        result=ext.integrate(sample_field(0),None,'10m',12)
        self.assertFalse(result['truncated'])
        self.assertEqual(result['hours_reached'],48)
        self.assertEqual(len(result['points']),193)
if __name__=='__main__':unittest.main()
