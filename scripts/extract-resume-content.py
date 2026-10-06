"""Extract DOCX paragraphs only; never infer candidate facts or execute document code."""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

with zipfile.ZipFile(sys.argv[1]) as archive:
    info = archive.getinfo('word/document.xml')
    if info.file_size > 8_000_000:
        raise ValueError('Expanded document exceeds 8 MB')
    document = ET.fromstring(archive.read(info))
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
lines = [''.join(t.text or '' for t in p.findall('.//w:t', ns)) for p in document.findall('.//w:p', ns)]
print(json.dumps({'text': '\n'.join(lines), 'warnings': ['Reading order of tables may need correction. Images and scanned text are not extracted.']}))
