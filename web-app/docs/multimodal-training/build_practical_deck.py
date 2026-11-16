"""Generate the practical deck from a qualified local editor build and real execution evidence."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path

from PIL import Image
from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_CONNECTOR, MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.oxml.ns import qn
from pptx.oxml.xmlchemy import OxmlElement
from pptx.util import Inches, Pt

HERE = Path(__file__).resolve().parent
PLAN = json.loads((HERE / 'slides.json').read_text())
input_path = HERE / 'editor-captures.json'
if not input_path.is_file():
    raise SystemExit('Await the accepted real editor and editor-captures.json; no placeholder deck is generated.')
INPUTS = json.loads(input_path.read_text())
if INPUTS.get('accepted_qualified_build') is not True or INPUTS.get('accepted_editor_execution') is not True:
    raise SystemExit('A qualified real local editor build and accepted edited execution are required.')
CAPTURE_SOURCE = INPUTS.get('capture_source', {})
if CAPTURE_SOURCE.get('kind') != 'qualified_local_build':
    raise SystemExit('Declare the actual capture source as qualified_local_build.')
if not CAPTURE_SOURCE.get('source_revision') or not CAPTURE_SOURCE.get('url'):
    raise SystemExit('The local capture URL and exact source revision are required.')
for slide in PLAN['slides']:
    name = slide.get('capture')
    if name:
        fact = INPUTS['captures'][name]
        actual = HERE / 'assets' / name
        if hashlib.sha256(actual.read_bytes()).hexdigest() != fact['sha256']:
            raise SystemExit(f'Actual capture bytes differ: {name}')
        if not fact.get('state') or not fact.get('recipe_evidence'):
            raise SystemExit(f'Actual state/recipe evidence is required: {name}')

evidence_path = HERE / 'teaching-evidence.json'
if not evidence_path.is_file():
    raise SystemExit('Await actual native prediction/history evidence; no numerical placeholders are rendered.')
EVIDENCE = json.loads(evidence_path.read_text())
if EVIDENCE.get('accepted_native_evidence') is not True:
    raise SystemExit('Actual native prediction and edited-history evidence must be accepted first.')
for fact in [EVIDENCE['late_prediction'], *EVIDENCE['history']]:
    if not (HERE / fact['evidence_file']).is_file():
        raise SystemExit('Referenced native evidence export is missing: '+fact['evidence_file'])
if len(EVIDENCE['history']) < 3:
    raise SystemExit('The three actual source/capacity history entries are required.')
if len({row['folds_fingerprint'] for row in EVIDENCE['history']}) != 1:
    raise SystemExit('The before/after history table requires the same actual folds.')
if len({row['dataset_fingerprint'] for row in EVIDENCE['history']}) != 1:
    raise SystemExit('The before/after history table requires the same actual dataset.')

light = (HERE / 'assets/theme.css').read_text().split('/* Dark', 1)[0]
T = dict(re.findall(r'--([a-z0-9-]+):\s*#([a-fA-F0-9]{6})', light))
C = {'paper':T['paper'], 'ink':T['text'], 'muted':T['text-2'], 'line':T['border'],
     'teal':T['teal'], 'teal_d':T['teal-d'], 'surface':T['surface'], 'wash':T['bg-alt'],
     'pale':'E8F4EF', 'grid':'F3F0E9'}
fonts = subprocess.check_output(['fc-list', ':', 'family'], text=True)
fallback = 'Liberation Sans' if 'Liberation Sans' in fonts else 'DejaVu Sans'
BODY = 'Inter' if 'Inter' in fonts else fallback
DISPLAY = 'IBM Plex Sans' if 'IBM Plex Sans' in fonts else fallback
prs = Presentation()
prs.slide_width, prs.slide_height = Inches(13.333333), Inches(7.5)
prs.core_properties.title = 'Build and edit multimodal pipelines with nirs4all'
prs.core_properties.author = 'GBeurier'
prs.core_properties.subject = 'Practical chemometrics workshop: 21 min support, 17 min demos, 2 min discussion'


def color(key):
    return RGBColor.from_string(C.get(key, key))


def text(s, x, y, w, h, value, size=22, bold=False, tone='ink', center=False):
    sh = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = sh.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = 0
    tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate(value.split('\n')):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = PP_ALIGN.CENTER if center else PP_ALIGN.LEFT
        p.space_after = Pt(10)
        r = p.add_run(); r.text = line
        r.font.name, r.font.size, r.font.bold = BODY, Pt(size), bold
        r.font.color.rgb = color(tone)
    return sh


def line(s, x1, y1, x2, y2, tone='line', weight=1):
    sh = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    sh.line.color.rgb, sh.line.width = color(tone), Pt(weight)
    return sh


def box(s, x, y, w, h, value, tone='pale', size=22):
    sh = s.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.fill.solid(); sh.fill.fore_color.rgb = color(tone)
    sh.line.color.rgb = color('teal')
    sh.adjustments[0] = .10
    tf = sh.text_frame; tf.word_wrap = True
    tf.margin_left = tf.margin_right = Inches(.1)
    tf.margin_top = tf.margin_bottom = Inches(.05)
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    tf.text = value
    for p in tf.paragraphs:
        p.alignment = PP_ALIGN.CENTER
        for r in p.runs:
            r.font.name, r.font.size, r.font.bold = BODY, Pt(size), True
            r.font.color.rgb = color('teal_d')
    return sh


def image(s, name, x, y, w, h, description, roi=None):
    path = HERE / 'assets' / name
    iw, ih = Image.open(path).size
    left,top,right,bottom = roi or (0,0,iw,ih)
    k = min(w/(right-left), h/(bottom-top))
    fw, fh = (right-left)*k, (bottom-top)*k
    sh = s.shapes.add_picture(str(path), Inches(x+(w-fw)/2), Inches(y+(h-fh)/2), Inches(fw), Inches(fh))
    sh.crop_left,sh.crop_top=left/iw,top/ih
    sh.crop_right,sh.crop_bottom=(iw-right)/iw,(ih-bottom)/ih
    for element in sh._element.iter():
        if element.tag.endswith('}cNvPr'):
            element.set('descr', description); break
    return sh


def table(s, x, y, widths, rows, size=21, heights=None):
    heights = heights or [.6]*len(rows)
    sh = s.shapes.add_table(len(rows),len(widths),Inches(x),Inches(y),Inches(sum(widths)),Inches(sum(heights)))
    for j,width in enumerate(widths): sh.table.columns[j].width=Inches(width)
    for i,row in enumerate(rows):
        sh.table.rows[i].height=Inches(heights[i])
        for j,value in enumerate(row):
            cell=sh.table.cell(i,j); cell.text=str(value)
            cell.margin_left=cell.margin_right=Inches(.10)
            cell.margin_top=cell.margin_bottom=Inches(.07)
            cell.vertical_anchor=MSO_ANCHOR.MIDDLE
            cell.fill.solid(); cell.fill.fore_color.rgb=color('ink' if i==0 else ('wash' if i%2==0 else 'surface'))
            for paragraph in cell.text_frame.paragraphs:
                paragraph.space_after=Pt(0)
                for run in paragraph.runs:
                    run.font.name=BODY; run.font.size=Pt(size if i else size-1)
                    run.font.bold=i==0; run.font.color.rgb=color('surface' if i==0 else 'ink')
    return sh


def arrow(s,x,y,w=.45,h=.35):
    sh=s.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW,Inches(x),Inches(y),Inches(w),Inches(h))
    sh.fill.solid(); sh.fill.fore_color.rgb=color('teal_d'); sh.line.fill.background()
    return sh


def fusion_comparison(s):
    table(s,.65,2.18,[1.5,2.65,2.7,2.55,2.6],[
        ['Fusion','Information merged','Before the merge','After the merge','Concrete example'],
        ['Early','Source variables','Source steps; no predictor','One PLS','168 spectral variables'],
        ['Mid','Learned features','Trained source branches','Shared prediction head','6 + 6 = 12 features'],
        ['Late','Model predictions','A model per source','Fixed mean or combiner','3 source predictions'],
    ],size=20,heights=[.72,1.0,1.0,1.0])
    text(s,.8,6.18,11.8,.3,'Ask what crosses the merge: variables, learned features, or predictions.',22,True,'teal_d')


def early_matrix(s):
    text(s,.78,1.98,11.8,.4,'96 calibration observations · the same sample IDs in every block',24,True)
    for index,(x,label,width) in enumerate([(.75,'Raman',48),(4.95,'NIRS',64),(9.15,'MIR',56)],1):
        box(s,x,2.65,3.4,1.05,f'S{index} · {label}\n96 × {width}',size=27)
        line(s,x+1.7,3.7,4.1,4.45,'teal_d',1.7)
    box(s,.8,4.45,6.4,1.12,'Joined X: 96 × 168\n[X Raman | X NIRS | X MIR]',size=25)
    arrow(s,7.4,4.84,.4,.34)
    box(s,8.0,4.45,2.4,1.12,'B1 · PLS\n3 components',size=21)
    arrow(s,10.6,4.84,.4,.34); box(s,11.2,4.45,1.3,1.12,'ŷ',size=34)
    text(s,.85,5.94,11.6,.4,'Three source inputs S1 / S2 / S3 feed one model branch B1.',23)


def late_predictions(s):
    for index,(y,label) in enumerate([(2.0,'Raman'),(2.95,'NIRS'),(3.9,'MIR')],1):
        box(s,.75,y,2.0,.7,f'S{index} · {label}',size=20); arrow(s,2.95,y+.18)
        box(s,3.6,y,2.2,.7,f'B{index} · PLS',tone='wash',size=22); arrow(s,6.0,y+.18)
        box(s,6.65,y,1.55,.7,'ŷ '+label,size=21); line(s,8.2,y+.35,9.0,3.3,'teal_d',1.7)
    box(s,9.0,2.65,3.45,1.35,'Fixed native mean\n(ŷ R + ŷ N + ŷ M) / 3',size=23)
    fact=EVIDENCE['late_prediction']
    text(s,.78,4.92,11.7,.35,f"Actual {fact['scope']} row · target unit: {fact['unit']}",18,False,'muted')
    table(s,.75,5.35,[2.8,2.15,2.15,2.15,2.15],[
        ['Sample ID','Raman ŷ','NIRS ŷ','MIR ŷ','Native mean ŷ'],
        [fact['sample_id'],*[f"{fact[key]:.4f}" for key in ['raman','nirs','mir','native_mean']]],
    ],size=21,heights=[.48,.6])


def stacking_matrix(s):
    text(s,.78,1.98,11.7,.42,'3 sources × PLS / Ridge → 6 prediction columns',26,True)
    table(s,.75,2.72,[2.0]*6,[
        ['Raman\nPLS (B1)','Raman\nRidge (B2)','NIRS\nPLS (B3)','NIRS\nRidge (B4)','MIR\nPLS (B5)','MIR\nRidge (B6)'],
        ['OOF ŷ R,P','OOF ŷ R,R','OOF ŷ N,P','OOF ŷ N,R','OOF ŷ M,P','OOF ŷ M,R'],
    ],size=21,heights=[.86,.68])
    text(s,.85,4.45,4.9,.5,'Z: 96 rows × 6 OOF columns',24,True)
    arrow(s,5.85,4.54,.5,.4); box(s,6.75,4.3,3.3,.92,'Ridge combiner',size=25)
    arrow(s,10.3,4.54,.5,.4); box(s,11.15,4.3,1.25,.92,'ŷ',size=32)
    text(s,.85,5.7,11.7,.65,'OOF: each training prediction comes from a model that did not fit that row or its group.',21,True,'teal_d')


def mbpls_blocks(s):
    for x,label in [(.75,'Raman\n48 variables'),(4.95,'NIRS\n64 variables'),(9.15,'MIR\n56 variables')]:
        box(s,x,2.2,3.4,1.1,label,size=26); line(s,x+1.7,3.3,6.65,4.1,'teal_d',1.7)
    box(s,3.1,4.1,7.1,1.45,'MB-PLS · NIPALS profile\nCentered blocks · equal super weights',size=27)
    text(s,.85,5.94,11.7,.5,'The head keeps block widths [48, 64, 56]; it does not erase source identity.',23,True)


def mid_image(s):
    text(s,.8,1.94,11.8,.35,'Starting architecture · one joint model B1 with two internal encoders',22,True)
    for y,source,branch in [(2.35,'NIRS\n64 variables','conv1d\nencoder'),(4.0,'Image\n12 × 12 × 1','conv2d\nencoder')]:
        box(s,.6,y,2.15,1.05,source,size=20); arrow(s,2.9,y+.35,.34,.32)
        box(s,3.4,y,2.0,1.05,branch,tone='wash',size=22); arrow(s,5.55,y+.35,.34,.32)
        box(s,6.05,y,1.8,1.05,'Embedding\n6',size=20); line(s,7.85,y+.525,8.45,3.7,'teal_d',1.7)
    box(s,8.45,3.1,1.65,1.2,'Concat\n12',size=24); arrow(s,10.23,3.53,.32,.32)
    box(s,10.7,3.1,1.3,1.2,'Head\n8',size=24); arrow(s,12.08,3.53,.25,.3)
    text(s,12.45,3.43,.4,.5,'ŷ',30,True,'teal_d')
    text(s,.8,5.76,11.8,.57,'6 + 6 = 12 learned features → head (8 units) → one target.',23,True)


def history_table(s):
    rows=EVIDENCE['history']
    text(s,.78,1.98,11.8,.4,f"Same {rows[0]['n']} calibration observations · native OOF RMSE",25,True)
    table_rows=[['Saved draft','Source inputs','Edit','PLS','OOF RMSE']]+[
        [row['label'],row['sources_label'],row['edit'],row['components'],f"{row['oof_rmse']:.4f}"]
        for row in rows[:3]
    ]
    table(s,.65,2.55,[3.2,3.7,2.2,1.1,1.8],table_rows,
          size=21,heights=[.62]+[.9]*min(len(rows),3))
    text(s,.8,6.0,11.9,.33,'In this simulation, more sources can require a different model capacity.',20,True,'teal_d')
    text(s,.8,6.37,11.9,.28,'Same data and folds. Compare OOF; keep the test out of tuning.',17,False,'muted')


def execution_fields(s):
    actual=EVIDENCE['execution_example']
    for x,width,title in [(.65,3.0,'UI setting'),(4.25,4.75,'Pipeline declaration'),(9.65,3.0,'Native output')]:
        box(s,x,2.12,width,.65,title,size=24)
    text(s,.9,3.08,2.5,.45,'B1 · PLS',27,True,'teal_d',True)
    text(s,.9,3.75,2.5,.45,'Components',25,True,center=True)
    text(s,.9,4.45,2.5,.9,str(actual['components']),54,True,'teal_d',True)
    arrow(s,3.75,4.05,.35,.4)
    snippet=json.dumps(actual['declaration_excerpt'],indent=2)
    code=text(s,4.48,2.99,4.3,3.25,snippet,16)
    for paragraph in code.text_frame.paragraphs:
        paragraph.space_after=Pt(0); paragraph.line_spacing=1.0
        for run in paragraph.runs: run.font.name='DejaVu Sans Mono'
    arrow(s,9.15,4.05,.35,.4)
    text(s,9.85,3.05,2.6,.55,f"OOF · n = {actual['n']}",25,True,'teal_d',True)
    text(s,9.85,3.9,2.6,.45,'RMSE',24,True,center=True)
    text(s,9.85,4.6,2.6,.65,f"{actual['oof_rmse']:.7f}",30,True,'teal_d',True)
    text(s,9.85,5.3,2.6,.35,actual['unit'],19,center=True)
    text(s,.85,6.2,11.7,.32,'Exact declaration fields and native output from the same saved pipeline.',19,True,'teal_d')


def mid_inspection(s,spec):
    name=spec['capture']; fact=INPUTS['captures'][name]
    for i,action in enumerate(spec['presenter_action']):
        text(s,.7+i*4.2,1.98,3.95,.58,action,18,True,'teal_d')
    text(s,.7,2.58,11.9,.18,'Actual qualified build capture · two detail crops of the same editor state',11,tone='muted')
    image(s,name,.65,2.94,6.35,3.57,fact['state']+'; actual B1 network and source input region.',roi=(280,0,810,360))
    text(s,7.35,2.92,5.2,.32,'The actual edited field',20,True,'teal_d')
    image(s,name,7.4,3.35,5.1,1.25,'Actual Embedding size field contains 8.',roi=(1015,125,1182,205))
    text(s,7.35,4.82,5.2,.35,'Its internal encoders',20,True,'teal_d')
    image(s,name,7.4,5.2,5.1,1.25,'Actual inspector lists NIRS conv1d and image conv2d with their source shapes.',roi=(850,515,1182,578))


def source_inspection(s,spec):
    name=spec['capture']
    for i,action in enumerate(spec['presenter_action']):
        text(s,.7+i*4.2,1.98,3.95,.58,action,18,True,'teal_d')
    text(s,.7,2.58,11.9,.18,'Actual qualified build capture · detail crops of the same selected sample-002',11,tone='muted')
    text(s,.8,2.95,6.5,.34,'S1 · NIRS · 64 wavelengths',22,True,'teal_d')
    image(s,name,.75,3.42,6.6,3.05,'NIRS source: 64 wavelengths; selected sample-002 is the red trace, displayed on its original wavelength axis.',roi=(30,216,615,558))
    text(s,8.1,2.95,4.3,.34,'S2 · Image · 12 × 12 × 1',22,True,'teal_d')
    image(s,name,8.4,3.42,3.1,2.95,'Actual grayscale image for the same sample-002; target 1.263 a.u., without per-image contrast stretching.',roi=(38,725,251,936))
    text(s,8.4,6.42,3.1,.22,'Selected: sample-002',15,True,center=True)


for spec in PLAN['slides']:
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.background.fill.solid(); s.background.fill.fore_color.rgb = color('paper')
    for i in range(26): line(s,i*.52,0,i*.52,7.5,'grid',.25)
    for i in range(15): line(s,0,i*.52,13.333333,i*.52,'grid',.25)
    image(s,'nirs4all-icon.png',.55,.25,.42,.42,'Canonical flagship nirs4all teal logo')
    text(s,1.08,.30,3,.35,'nirs4all',20,True,'teal_d')
    head=text(s,.55,.97,12.25,.7,spec['title'],29,True)
    for paragraph in head.text_frame.paragraphs:
        for run in paragraph.runs: run.font.name=DISPLAY
    line(s,.55,1.7,12.25,1.7)
    if spec['mode']=='opening':
        text(s,.75,2.1,8.8,2.4,'Start with one source.\nAdd another measurement.\nChoose where to combine them.',36,True)
        image(s,'nirs4all-icon.png',10.05,2.1,2.3,2.3,'nirs4all')
        for x,label in [(0.75,'21 min\npractical explanation'),(4.9,'17 min\nlive pipeline editing'),(9.05,'2 min\ndiscussion')]:box(s,x,5.0,3.45,.95,label,size=23)
    elif spec['mode']=='fusion_comparison': fusion_comparison(s)
    elif spec['mode']=='early_matrix': early_matrix(s)
    elif spec['mode']=='late_predictions': late_predictions(s)
    elif spec['mode']=='stacking_matrix': stacking_matrix(s)
    elif spec['mode']=='mbpls_blocks': mbpls_blocks(s)
    elif spec['mode']=='mid_image': mid_image(s)
    elif spec['mode']=='history_table': history_table(s)
    elif spec['mode']=='execution_fields': execution_fields(s)
    elif spec['mode']=='mid_inspection': mid_inspection(s,spec)
    elif spec['mode']=='source_inspection': source_inspection(s,spec)
    elif spec['mode']=='execution':
        for x, label in [(.7,'UI edit'),(4.95,'Pipeline declaration'),(9.2,'Native execution')]:
            box(s,x,1.98,3.45,.65,label,size=23)
        image(s,spec['capture'],.8,2.95,11.75,3.45,INPUTS['captures'][spec['capture']]['state'])
        text(s,.85,6.43,11.6,.18,'Actual qualified build capture · Web '+INPUTS['versions']['web']+' · '+INPUTS['capture_date'],11,tone='muted')
    else:
        for i,action in enumerate(spec['presenter_action']):
            text(s,.7+i*4.2,1.98,3.95,.58,action,18,True,'teal_d')
        name=spec['capture']
        text(s,.7,2.58,11.9,.18,'Actual qualified build capture · Web '+INPUTS['versions']['web']+' · '+INPUTS['capture_date'],11,tone='muted')
        image(s,name,.65,2.86,12.05,3.73,INPUTS['captures'][name]['state'])
    text(s,.72,6.76,11.95,.35,spec['takeaway'],17,True,'teal_d')
    text(s,.55,7.22,11.3,.18,INPUTS['url'],10,tone='muted')
    text(s,12.2,7.15,.5,.25,f"{spec['slide']:02d}",12,True,'teal_d',True)
    s.notes_slide.notes_text_frame.text=(f"Speaking: {spec['speech_seconds']} s. Live demo: {spec['demo_seconds']} s. Discussion: {spec.get('discussion_seconds',0)} s.\n\n"+spec['speaker_notes']+'\n\nLaboratory delivery URL: '+INPUTS['url']+'\nCapture source: qualified local build at '+CAPTURE_SOURCE['url']+'; source revision '+CAPTURE_SOURCE['source_revision']+'. Actual edited-draft evidence is retained with the capture.')
    for sh in s.shapes:
        style=sh._element.find(qn('p:style'))
        if style is not None:
            ref=style.find(qn('a:effectRef'))
            if ref is not None: ref.set('idx','0')
        props=sh._element.find(qn('p:spPr'))
        if props is not None and props.find(qn('a:effectLst')) is None:props.append(OxmlElement('a:effectLst'))
        assert sh.left>=0 and sh.top>=0
        assert sh.left+sh.width<=prs.slide_width+Inches(.02)
        assert sh.top+sh.height<=prs.slide_height+Inches(.02)
assert len(prs.slides)==18
assert sum(x['speech_seconds'] for x in PLAN['slides'])==1260
assert sum(x['demo_seconds'] for x in PLAN['slides'])==1020
assert sum(x.get('discussion_seconds',0) for x in PLAN['slides'])==120
output=HERE/'nirs4all_multimodal_training.pptx'
prs.save(output)
guide = (HERE/'demo-guide.html').read_text()
guide = re.sub(r'<p class="preview" data-preparation-note>.*?</p>', '', guide, flags=re.S)
(HERE/'demo-guide.html').write_text(guide)
(HERE/'generated-manifest.json').write_text(json.dumps({'inputs':INPUTS,'native_evidence':EVIDENCE,'slides':PLAN['slides'],'fonts':{'display':DISPLAY,'body':BODY}},indent=2)+'\n')
print(f'Created {output}; 18 slides, 21 + 17 + 2 minutes. Final rendering QA remains required.')
