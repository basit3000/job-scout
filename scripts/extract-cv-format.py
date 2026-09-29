"""Extract bounded formatting metadata only. Source prose never leaves this process."""
import collections
import json
import sys
import zipfile
import xml.etree.ElementTree as ET

W = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'


def attrs(element):
    return {key.removeprefix(W): value for key, value in element.attrib.items()} if element is not None else {}


def props(element):
    return {child.tag.removeprefix(W): attrs(child) for child in element} if element is not None else {}


def merge_props(*layers):
    result = {}
    for layer in layers:
        for key, values in layer.items():
            result[key] = {**result.get(key, {}), **values}
    return result


def extract(path):
    with zipfile.ZipFile(path) as package:
        if len(package.infolist()) > 2000 or sum(e.file_size for e in package.infolist()) > 40 * 1024 * 1024:
            raise ValueError('Word file expands beyond the supported limit.')
        for entry in package.infolist():
            if entry.filename.endswith('.xml') and entry.file_size > 8 * 1024 * 1024:
                raise ValueError('Word XML part is too large.')
        def xml(name):
            raw = package.read(name)
            if b'<!DOCTYPE' in raw.upper() or b'<!ENTITY' in raw.upper():
                raise ValueError('XML declarations are not supported.')
            return ET.fromstring(raw)
        doc = xml('word/document.xml')
        styles = xml('word/styles.xml')
        default_run = props(styles.find(f'{W}docDefaults/{W}rPrDefault/{W}rPr'))
        default_para = props(styles.find(f'{W}docDefaults/{W}pPrDefault/{W}pPr'))
        style_map = {s.get(W + 'styleId'): s for s in styles.findall(W + 'style')}
        def style_props(style_id, tag, seen=None):
            seen = set() if seen is None else seen
            if style_id in seen or style_id not in style_map:
                return {}
            seen.add(style_id)
            style = style_map[style_id]
            parent = attrs(style.find(W + 'basedOn')).get('val')
            return merge_props(style_props(parent, tag, seen), props(style.find(W + tag)))
        records = []
        aliases = {'education': 'Education', 'experience': 'Experience', 'work experience': 'Experience',
                   'professional experience': 'Experience', 'projects': 'Projects', 'technical projects': 'Projects',
                   'skills': 'Skills', 'technical skills': 'Skills', 'summary': 'Summary', 'profile': 'Summary',
                   'certifications': 'Certifications', 'languages': 'Languages', 'awards': 'Awards',
                   'publications': 'Publications', 'volunteering': 'Volunteering'}
        order = []
        for para in doc.iter(W + 'p'):
            direct = props(para.find(W + 'pPr'))
            style_id = direct.get('pStyle', {}).get('val', 'Normal')
            pp = merge_props(default_para, style_props(style_id, 'pPr'), direct)
            base = merge_props(default_run, style_props(style_id, 'rPr'), props(para.find(f'{W}pPr/{W}rPr')))
            text = ''.join(n.text or '' for n in para.iter(W + 't')).strip()
            if not text:
                continue
            runs = []
            for run in para.iter(W + 'r'):
                run_text = ''.join(n.text or '' for n in run.iter(W + 't'))
                if not run_text.strip():
                    continue
                rp = merge_props(base, props(run.find(W + 'rPr')))
                runs.append((rp, len(run_text)))
            heading = aliases.get(text.lower().strip(':'))
            if heading and heading not in order:
                order.append(heading)
            records.append({'runs': runs or [(base, len(text))], 'pp': pp, 'heading': heading,
                            'uppercase': text.isupper() if heading else False})
        if not records:
            raise ValueError('No readable paragraphs in this Word file.')
        def common(items, key, attr, fallback):
            values = collections.Counter()
            for rec in items:
                for rp, weight in rec['runs']:
                    value = rp.get(key, {}).get(attr)
                    if value and value != 'auto':
                        values[value] += weight
            return values.most_common(1)[0][0] if values else fallback
        sections = list(doc.iter(W + 'sectPr'))
        if not sections:
            raise ValueError('Word file has no page geometry.')
        section = sections[-1]
        size = attrs(section.find(W + 'pgSz'))
        margin = attrs(section.find(W + 'pgMar'))
        body = [r for r in records[1:] if not r['heading']] or records
        headings = [r for r in records if r['heading']]
        mm = lambda value: round(float(value) * 25.4 / 1440, 2)
        pt = lambda items, fallback: float(common(items, 'sz', 'val', fallback)) / 2
        spacing = collections.Counter((r['pp'].get('spacing', {}).get('line', '240'),
                                        r['pp'].get('spacing', {}).get('lineRule', 'auto')) for r in body).most_common(1)[0][0]
        after = collections.Counter(r['pp'].get('spacing', {}).get('after', '0') for r in body).most_common(1)[0][0]
        heading_before = max([float(r['pp'].get('spacing', {}).get('before', '0')) / 20 for r in headings] or [8])
        indent = next((r['pp'].get('ind', {}) for r in body if 'numPr' in r['pp']), {})
        layout = {'widthMm': mm(size.get('w', 11906)), 'heightMm': mm(size.get('h', 16838)),
                  **{f'margin{k.title()}Mm': mm(margin.get(k, 720)) for k in ['top', 'bottom', 'left', 'right']},
                  'font': common(body, 'rFonts', 'ascii', 'Arial'), 'color': common(body, 'color', 'val', '000000'),
                  'bodyPt': pt(body, '20'), 'namePt': pt(records[:1], '32'), 'headingPt': pt(headings, '20'),
                  'contactPt': pt(records[1:2], '20'), 'headerAlign': {'start': 'left', 'end': 'right'}.get(
                      records[0]['pp'].get('jc', {}).get('val'), records[0]['pp'].get('jc', {}).get('val', 'left')),
                  'headingUppercase': any(r['uppercase'] for r in headings),
                  'headingRule': bool(doc.findall(f'.//{W}pBdr/{W}bottom') or doc.findall(f'.//{W}tcBorders/{W}bottom')),
                  'lineHeight': round(float(spacing[0]) / 240, 3) if spacing[1] == 'auto' else 1.1,
                  'paragraphAfterPt': float(after) / 20, 'sectionBeforePt': heading_before or 8,
                  'bulletIndentPt': float(indent.get('start', indent.get('left', 360))) / 20}
        warnings = ['Formatting profile for HTML/PDF output; complex Word layout is approximated. Review the preview before use.',
                    'Fonts must be installed locally; otherwise the browser uses Arial.']
        if len(sections) > 1:
            warnings.append('Multiple Word sections detected; the last section supplies page geometry.')
        if doc.findall(f'.//{W}tbl'):
            warnings.append('Word tables are converted to a single reading column with aligned entry dates.')
        if doc.findall(f'.//{W}drawing') or doc.findall(f'.//{W}pict'):
            warnings.append('Images and floating shapes are not reproduced.')
        return {'layout': layout, 'sectionOrder': order, 'maxPages': 1, 'warnings': warnings}


if __name__ == '__main__':
    try:
        print(json.dumps(extract(sys.argv[1])))
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
