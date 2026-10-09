"""Run with SPEC_REFERENCE_PDF set to the locally supplied RW Rev D3 PDF."""
import os
import unittest
from pathlib import Path
from spec_service import parse_pdf

@unittest.skipUnless(os.environ.get('SPEC_REFERENCE_PDF'),'Set SPEC_REFERENCE_PDF to the private reference PDF')
class ReferencePdfTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.result=parse_pdf(Path(os.environ['SPEC_REFERENCE_PDF']))
    def find(self,symbol,product='W25Q32RW',page=None):
        return [r for r in self.result['rows'] if r['symbol']==symbol and r['產品名稱']==product and (page is None or r['page']==page)]
    def test_all_products_receive_shared_specs(self):
        for product in self.result["products"]:
            self.assertEqual(len([r for r in self.result["rows"] if r["產品名稱"]==product and r["spec type"]=="DC"]),20,product)
    def test_dc_groups_and_six_frequency_rows(self):
        self.assertEqual(self.find('ICC1')[0]['max'],50)
        self.assertEqual(self.find('CIN','W25Q02RW')[0]['max'],24)
        self.assertEqual(len(self.find('Icc3')),6)
        self.assertEqual([r['max'] for r in self.find('Icc3')],[7,9,10,12,13,12])
        self.assertEqual([r['max'] for r in self.find('Icc3','W25Q02RW')],[36,44,48,56,60,56])
    def test_dc_classification_on_continuation_page(self):
        self.assertEqual(self.find('ICC4')[0]['spec type'],'DC')
    def test_program_erase(self):
        self.assertEqual(self.find('tCE',page=178)[0]['max'],25)
        self.assertEqual(self.find('tCE','W25Q02RW',178)[0]['max'],400)
        self.assertEqual(self.find('tPP')[0]['typ'],0.15)
        self.assertEqual(self.find('tWR')[0]['max'],200)
    def test_factory_condition_preserved(self):
        self.assertIn('Factory Mode',self.find('tCE',page=179)[0]['condition'])
        self.assertIn('1.8',self.find('tCE',page=179)[0]['condition'])
    def test_measurement_ranges_not_lost(self):
        row=self.find('VIN',page=171)[0]
        self.assertEqual(row['spec type'],'AC')
        self.assertEqual(row['min'],'0.1 VCC')
        self.assertEqual(row['max'],'0.9 VCC')
    def test_explicit_continuation_classification(self):
        r=parse_pdf(Path(os.environ['SPEC_REFERENCE_PDF']),[177])
        self.assertTrue(all(x['spec type']=='AC' for x in r['rows']))
    def test_clock_matrix_alignment(self):
        rs=[r for r in self.result['rows'] if r['產品名稱']=='W25Q32RW' and r['page']==172 and 'opcode=EBh;' in r['condition'] and 'Dummy=16;' in r['condition']]
        self.assertEqual([r['max'] for r in rs],[200,133])
        self.assertIn('DS bit enabled',rs[0]['condition'])
    def test_ac_notes_and_timing(self):
        self.assertEqual(self.find('tDVCH')[0]['min'],2)
        self.assertEqual(self.find('tCHDX','W25Q02RW')[0]['min'],2.5)
        self.assertIn('guaranteed by design',self.find('tDP')[0]['_notes'])
