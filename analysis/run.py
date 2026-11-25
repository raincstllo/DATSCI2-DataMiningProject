"""Run one analysis: python analysis/run.py retention [--as-of YYYY-MM-DD]"""

import argparse
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from pipeline.common import log_step, shutdown  # noqa: E402
from pipeline.etl import run_etl  # noqa: E402
from pipeline.retention import run_retention  # noqa: E402
from pipeline.revenue import run_revenue  # noqa: E402

ANALYSES = {'retention': run_retention, 'revenue': run_revenue}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('analysis', choices=sorted(ANALYSES))
    parser.add_argument('--as-of', type=date.fromisoformat, default=date.today())
    args = parser.parse_args()

    try:
        log_step('start', analysis=args.analysis, as_of=args.as_of)
        clean, report = run_etl(args.as_of)
        ANALYSES[args.analysis](clean, report, args.as_of)
        log_step('done', analysis=args.analysis)
    except Exception as exc:  # report a clean error line for the UI
        log_step('error', message=f'{type(exc).__name__}: {exc}')
        return 1
    finally:
        shutdown()
    return 0


if __name__ == '__main__':
    sys.exit(main())
