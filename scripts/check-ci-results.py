#!/usr/bin/env python3
"""Keep the required validate check truthful when optional jobs are skipped."""
import json
import os


def require_success(needs: dict, plan: dict) -> None:
    if needs.get('changes', {}).get('result') != 'success':
        raise ValueError('Change classification did not succeed')
    expected = {}
    for job, flag in [('app', 'app'), ('public', 'public'),
                      ('workflow_contracts', 'contracts'), ('historical', 'historical')]:
        value = plan.get(flag)
        if type(value) is not bool:
            raise ValueError(f'Missing or invalid CI decision: {flag}')
        expected[job] = value
    # Full app validation includes the same metadata tests and version check.
    expected['metadata'] = not plan['app']
    for job, required in expected.items():
        result = needs.get(job, {}).get('result')
        allowed = {'success'} if required else {'success', 'skipped'}
        if result not in allowed:
            raise ValueError(f'{job}: expected {sorted(allowed)}, received {result}')


if __name__ == '__main__':
    require_success(json.loads(os.environ['CI_NEEDS']), json.loads(os.environ['CI_PLAN']))
    print('All checks required by the committed changes passed.')
