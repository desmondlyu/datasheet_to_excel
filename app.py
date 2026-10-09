"""Local-only web entry point. Run: python app.py"""
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Lock
import secrets
import time
from urllib.parse import urlsplit
import fitz
from flask import Flask, request, jsonify, render_template, session, send_file
from extraction_core import parse_page_input
from spec_service import parse_pdf, compare_rows, make_workbook, COLUMNS

app=Flask(__name__,static_folder='web/static',template_folder='web/templates')
app.config.update(SECRET_KEY=secrets.token_hex(32),MAX_CONTENT_LENGTH=50*1024*1024,
                  SESSION_COOKIE_HTTPONLY=True,SESSION_COOKIE_SAMESITE='Strict')
_results={}; _lock=Lock(); _conversion=Lock(); TTL=1800

@app.before_request
def local_write_guard():
    if request.method=='POST':
        origin=request.headers.get('Origin')
        if request.headers.get('X-Requested-With')!='SpecWorkbench' or (origin and urlsplit(origin).netloc!=request.host):
            return jsonify(error='請從本機應用程式頁面執行。'),403

@app.after_request
def headers(response):
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Cache-Control']='no-store'
    response.headers['Content-Security-Policy']="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
    return response

@app.errorhandler(413)
def too_large(e):return jsonify(error='上傳總大小超過 50 MB。'),413

@app.get('/')
def home():return render_template('index.html')

def save_pdf(upload,path):
    if not upload or not upload.filename:raise ValueError('請選擇新版 PDF。')
    upload.save(path)
    if not path.read_bytes()[:1024].lstrip().startswith(b'%PDF-'):raise ValueError('檔案不是有效的 PDF。')
    try:
        with fitz.open(path) as p:
            if p.needs_pass:raise ValueError('請先解除 PDF 密碼保護。')
            if len(p)>600:raise ValueError('目前每份 PDF 上限為 600 頁。')
    except ValueError:raise
    except Exception as e:raise ValueError('無法讀取 PDF，請確認檔案未損壞。') from e

@app.post('/api/convert')
def convert():
    if not _conversion.acquire(blocking=False):return jsonify(error='目前有另一份檔案正在解析，請稍後重試。'),429
    try:
        pages=parse_page_input(request.form.get('pages',''))
        old_pages=parse_page_input(request.form.get('old_pages',''))
        compare=request.form.get('compare')=='true'
        old=request.files.get('old_pdf')
        if compare and (not old or not old.filename):raise ValueError('版本比對需要舊版 PDF。')
        with TemporaryDirectory(prefix='spec-workbench-') as tmp:
            path=Path(tmp)/'new.pdf';upload=request.files.get('new_pdf');save_pdf(upload,path)
            result=parse_pdf(path,pages)
            result['filename']=Path(upload.filename.replace('\\','/')).name
            result['compared']=compare
            if compare:
                op=Path(tmp)/'old.pdf';save_pdf(old,op);previous=parse_pdf(op,old_pages)
                result['rows']=compare_rows(result['rows'],previous['rows'])
                result['old_filename']=Path(old.filename.replace('\\','/')).name
                result['review'] += [dict(r,reason='舊版：'+r['reason']) for r in previous['review']]
                result['sources'] += [dict(s,section='舊版：'+s['section']) for s in previous['sources']]
        now=time.time(); key=secrets.token_urlsafe(24)
        with _lock:
            for k in list(_results):
                if now-_results[k][0]>TTL:del _results[k]
            prior=session.get('result')
            if prior:_results.pop(prior,None)
            while len(_results)>=8:_results.pop(next(iter(_results)))
            _results[key]=(now,result)
        session['result']=key
        return jsonify(dict(result,columns=COLUMNS))
    except ValueError as e:return jsonify(error=str(e)),400
    except Exception:
        app.logger.exception('PDF conversion failed')
        return jsonify(error='解析失敗。請確認 PDF 可選取文字，或改用指定頁碼。'),422
    finally:_conversion.release()

def get_result():
    with _lock:
        entry=_results.get(session.get('result'))
        if entry and time.time()-entry[0]<TTL:return entry[1]
    return None

@app.get('/api/export')
def export():
    result=get_result()
    if result is None:return jsonify(error='預覽已逾時或尚未轉換，請重新上傳。'),404
    filtered=dict(result)
    product=request.args.get('product','');kind=request.args.get('kind','');q=request.args.get('q','').casefold();status=request.args.get('status','')
    filtered['rows']=[r for r in result['rows'] if (not product or r['產品名稱']==product) and (not kind or r['spec type']==kind) and (not status or r['_status']==status) and (not q or q in ' '.join(str(r[c]) for c in COLUMNS).casefold())]
    return send_file(BytesIO(make_workbook(filtered)),download_name='datasheet_specs.xlsx',as_attachment=True,mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

if __name__=='__main__':
    from waitress import serve
    print('規格工作台：http://127.0.0.1:8000',flush=True)
    serve(app,host='127.0.0.1',port=8000,threads=4)
