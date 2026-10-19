"""Export Social Decision Experiment Firestore submissions into Excel-friendly CSV.

Authorization: use Google Cloud Application Default Credentials for the research
project. Never copy credentials, student identifiers, or response CSVs to GitHub.

Examples:
  pip install google-cloud-firestore
  gcloud auth application-default login
  python scripts/export_submissions.py --project YOUR_PROJECT_ID --output results.csv

  # Validate/flatten a local JSON preview export without using Firebase:
  python scripts/export_submissions.py --input-json sample.json --output preview.csv
"""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

EMOTIONS = (
    'excited', 'joyful', 'elated', 'serene', 'relaxed', 'contented',
    'angry', 'anxious', 'fearful', 'sad', 'gloomy', 'downhearted',
)
ID_PREFIXES = ('PD', 'UG', 'PG', 'TG', 'DG')
EXPECTED_IDS = {f'{prefix}{i:02d}' for prefix in ID_PREFIXES for i in range(1, 7)}
COLUMNS = (
    'participant_id', 'experiment_id', 'experiment_version', 'submitted_at',
    'started_at', 'completed_at', 'session_duration_ms', 'randomization_seed',
    'trial_index', 'scenario_id', 'game', 'condition_a', 'condition_b',
    'condition_a_note', 'condition_b_note', 'condition_a_numeric',
    'stake_krw', 'other_endowment_krw', 'decision', 'trial_duration_ms',
    *EMOTIONS,
)


def flatten(records: list[dict], scenarios: list[dict]) -> list[dict]:
    lookup = {s['id']: s for s in scenarios}
    if set(lookup) != EXPECTED_IDS:
        raise ValueError('Scenario catalog must contain 30 unique expected IDs')
    rows = []
    for record in records:
        order, trials = record.get('order'), record.get('trials')
        if not isinstance(order, list) or len(order) != 30 or set(order) != EXPECTED_IDS:
            raise ValueError('Submission order must contain every scenario exactly once')
        if not isinstance(trials, list) or len(trials) != 30:
            raise ValueError('Submission must contain exactly 30 trial responses')
        participant = record.get('participantId', '(local-preview)')
        timestamp = record.get('submittedAt', '')
        if hasattr(timestamp, 'isoformat'):
            timestamp = timestamp.isoformat()
        for index, trial in enumerate(trials, 1):
            scenario_id = order[index - 1]
            if trial.get('scenarioId') != scenario_id or trial.get('trialIndex') != index:
                raise ValueError(f'Participant {participant}: trial {index} does not match presentation order')
            ratings = trial.get('emotions', {})
            if set(ratings) != set(EMOTIONS) or any(type(ratings[k]) is not int or not 1 <= ratings[k] <= 7 for k in EMOTIONS):
                raise ValueError(f'Participant {participant}: trial {index} has invalid ratings')
            sc = lookup[scenario_id]
            decision = trial.get('decision')
            if sc['decision']['type'] == 'choice':
                valid_decision = decision in sc['decision']['options']
            else:
                spec = sc['decision']
                valid_decision = (type(decision) is int and spec['min'] <= decision <= spec['max']
                                  and (decision - spec['min']) % spec['step'] == 0)
            if not valid_decision:
                raise ValueError(f'Participant {participant}: trial {index} has invalid decision')
            row = {
                'participant_id': participant,
                'experiment_id': record.get('experimentId', ''),
                'experiment_version': record.get('experimentVersion', ''),
                'submitted_at': timestamp,
                'started_at': record.get('startedAtISO', ''),
                'completed_at': record.get('completedAtISO', ''),
                'session_duration_ms': record.get('totalDurationMs', ''),
                'randomization_seed': record.get('randomizationSeed', ''),
                'trial_index': index,
                'scenario_id': scenario_id,
                'game': sc['game'],
                'condition_a': sc['conditionA'],
                'condition_b': sc['conditionB'],
                'condition_a_note': sc['conditionANote'],
                'condition_b_note': sc['conditionBNote'],
                'condition_a_numeric': sc.get('conditionANumeric'),
                'stake_krw': sc.get('stakeKRW'),
                'other_endowment_krw': sc.get('otherEndowmentKRW'),
                'decision': decision,
                'trial_duration_ms': trial.get('trialDurationMs', ''),
            }
            row.update({key: ratings[key] for key in EMOTIONS})
            rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', help='Firebase / Google Cloud project ID')
    parser.add_argument('--input-json', type=Path, help='Local preview JSON for offline validation')
    parser.add_argument('--output', type=Path, default=Path('responses.csv'))
    args = parser.parse_args()
    if not args.input_json and not args.project:
        parser.error('Specify either --project or --input-json')
    path = Path(__file__).resolve().parent.parent / 'data' / 'scenarios.json'
    scenarios = json.loads(path.read_text(encoding='utf-8'))

    if args.input_json:
        content = json.loads(args.input_json.read_text(encoding='utf-8'))
        records = content if isinstance(content, list) else [content]
    else:
        try:
            from google.cloud import firestore
        except ImportError as exc:
            raise SystemExit('Install dependency first: pip install google-cloud-firestore') from exc
        client = firestore.Client(project=args.project)
        ref = client.collection('experiments').document('social-decision-v1').collection('submissions')
        records = [document.to_dict() for document in ref.stream()]

    if not records:
        print('No submission documents found; output file was not created.')
        return

    rows = flatten(records, scenarios)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('w', newline='', encoding='utf-8-sig') as stream:
        writer = csv.DictWriter(stream, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)
    print(f'Exported {len(rows)} trial rows from {len(records)} submission(s) to {args.output}')


if __name__ == '__main__':
    main()