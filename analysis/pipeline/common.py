"""Shared helpers: config, one SparkSession, MongoDB access, step logging."""

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[2]
load_dotenv(ROOT / 'backend' / '.env')

_spark = None
_client = None


def log_step(step, **detail):
    """Print one JSON line per pipeline step so the UI can show progress.

    Never pass personal data (names) here.
    """
    print(json.dumps({'step': step, **detail}, default=str), flush=True)


def get_spark():
    """Create the local SparkSession once and reuse it (Unit: SparkSession)."""
    global _spark
    if _spark is None:
        os.environ.setdefault('PYSPARK_PYTHON', sys.executable)
        os.environ.setdefault('PYSPARK_DRIVER_PYTHON', sys.executable)
        import pyspark
        from pyspark.sql import SparkSession

        # Spark's own lookup breaks on paths with spaces (Windows), so set it directly.
        os.environ.setdefault('SPARK_HOME', str(Path(pyspark.__file__).parent))

        _spark = (
            SparkSession.builder.master('local[*]')
            .appName('dental-clinic-analysis')
            .config('spark.sql.shuffle.partitions', '4')
            .config('spark.sql.session.timeZone', 'UTC')
            .config('spark.ui.enabled', 'false')
            .config('spark.ui.showConsoleProgress', 'false')
            .getOrCreate()
        )
        _spark.sparkContext.setLogLevel('ERROR')
    return _spark


def get_db():
    global _client
    uri = os.environ.get('MONGODB_URI')
    if not uri:
        raise RuntimeError('MONGODB_URI is not set in backend/.env')
    if _client is None:
        _client = MongoClient(uri)
    return _client.get_default_database(default='test')


def save_result(result_type, payload, metrics):
    """Store one analysis run in the `results` collection (the API contract)."""
    doc = {
        'type': result_type,
        'generated_at': datetime.now(timezone.utc),
        'payload': payload,
        'metrics': metrics,
    }
    inserted = get_db().results.insert_one(doc)
    return inserted.inserted_id


def shutdown():
    global _spark, _client
    if _spark is not None:
        _spark.stop()
        _spark = None
    if _client is not None:
        _client.close()
        _client = None
