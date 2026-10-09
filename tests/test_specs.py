import unittest
from io import BytesIO
from openpyxl import load_workbook
from spec_service import compare_rows, make_workbook, COLUMNS

class SpecTests(unittest.TestCase):
    def row(self, **kw):
        r=dict.fromkeys(COLUMNS, '')
        r.update({'產品名稱':'W25Q32RW','symbol':'ICC1','parameter':'Standby Current','max':50,'typ':10,'spec type':'DC','condition':'/CS = VCC'})
        r.update(kw)
        return r
    def test_change_add_remove(self):
        rows=compare_rows([self.row(max=60), self.row(symbol='ICC2')],[self.row(),self.row(symbol='ICC3')])
        self.assertEqual([r['_status'] for r in rows],['changed','added','removed'])
        self.assertEqual(rows[0]['_changes']['max'],{'old':50,'new':60})
    def test_blank_not_zero(self):
        self.assertEqual(compare_rows([self.row(min=0)],[self.row()])[0]['_status'],'changed')
    def test_duplicate_keys_not_silently_overwritten(self):
        r=self.row()
        self.assertTrue(all(x['_status']=='review' for x in compare_rows([r,r],[r])))
    def test_xlsx_headers_numeric_and_formula_text(self):
        b=make_workbook({'rows':[self.row(description='=1+1')],'review':[],'sources':[]})
        s=load_workbook(BytesIO(b))['Specs']
        self.assertEqual([c.value for c in s[1]], COLUMNS)
        self.assertEqual(s['B2'].value,50)
        self.assertEqual(s['H2'].data_type,'s')
        self.assertIsNone(s['D2'].value)

if __name__=='__main__': unittest.main()
