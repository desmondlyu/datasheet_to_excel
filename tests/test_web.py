import unittest
from io import BytesIO
from app import app

class WebTests(unittest.TestCase):
    def setUp(self): self.client=app.test_client()
    def test_home(self):
        r=self.client.get('/')
        self.assertEqual(r.status_code,200)
        self.assertIn('規格工作台',r.get_data(as_text=True))
    def test_upload_requires_same_origin_header(self):
        self.assertEqual(self.client.post('/api/convert').status_code,403)
    def test_missing_pdf(self):
        self.assertEqual(self.client.post('/api/convert',headers={'X-Requested-With':'SpecWorkbench'}).status_code,400)
    def test_invalid_pdf(self):
        r=self.client.post('/api/convert',headers={'X-Requested-With':'SpecWorkbench'},data={'new_pdf':(BytesIO(b'not pdf'),'fake.pdf')})
        self.assertEqual(r.status_code,400)
    def test_download_has_no_result(self):
        self.assertEqual(self.client.get('/api/export').status_code,404)
    def test_cross_origin_is_rejected(self):
        self.assertEqual(self.client.post('/api/convert',headers={'X-Requested-With':'SpecWorkbench','Origin':'https://example.com'}).status_code,403)
