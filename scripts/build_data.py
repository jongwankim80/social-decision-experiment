"""Build data/scenarios.json from the original annotated study spreadsheet.

Usage:
    python scripts/build_data.py /path/to/30-scenarios.xlsx
"""
import json
import pathlib
import sys
import openpyxl

root = pathlib.Path(__file__).resolve().parents[1]
source = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'source_scenarios.xlsx'
wb = openpyxl.load_workbook(source, read_only=True, data_only=True)
ws = wb['시나리오_30개']
rows = list(ws.values)
headers = list(rows[0])
idx = {h: i for i, h in enumerate(headers)}

def read(row, key):
    return row[idx[key]]

scenarios = []
for row in rows[1:]:
    sid = str(read(row, 'ID')).strip()
    options_text = str(read(row, '행동 선택지 / 선택범위'))
    is_choice = read(row, '행동 응답 형식') == '단일선택'
    scenarios.append({
        'id': sid,
        'game': str(read(row, '게임종류(영문)')),
        'gameKo': str(read(row, '게임종류(한글)')),
        'conditionA': int(read(row, 'A수준 코드')),
        'conditionB': int(read(row, 'B수준 코드')),
        'conditionANote': str(read(row, 'A수준 구체값')),
        'conditionBNote': str(read(row, 'B수준 구체값')),
        'conditionANumeric': read(row, 'A수준 수치'),
        'stakeKRW': read(row, '기본금액(원)'),
        'otherEndowmentKRW': read(row, '상대 초기금액(원)'),
        'body': str(read(row, '독립 시나리오 본문(학생용)')),
        'question': str(read(row, '행동 선택 질문(학생용)')),
        'decision': (
            {'type': 'choice', 'options': [s.strip().rstrip('.') for s in options_text.split('|')]}
            if is_choice else
            {'type': 'amount',
             'min': int(read(row, '선택 최솟값(원)')),
             'max': int(read(row, '선택 최댓값(원)')),
             'step': int(read(row, '선택 간격(원)'))}
        )
    })

assert len(scenarios) == 30
assert len({sc['id'] for sc in scenarios}) == 30
assert all(sc['body'].strip() and sc['question'].strip() for sc in scenarios)
for prefix in ['PD','UG','PG','TG','DG']:
    matching = [sc for sc in scenarios if sc['id'].startswith(prefix)]
    assert len(matching) == 6
    assert {(sc['conditionA'], sc['conditionB']) for sc in matching} == {(a,b) for a in (1,2,3) for b in (1,2)}

out = root / 'data' / 'scenarios.json'
out.write_text(json.dumps(scenarios, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Wrote {len(scenarios)} scenarios: {out.stat().st_size:,} bytes to {out}')