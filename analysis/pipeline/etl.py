"""Extract visits from MongoDB, clean them with Spark, return a cached DataFrame (Unit: ETL)."""

from datetime import date

from pyspark.sql import functions as F
from pyspark.sql import types as T

from .common import get_db, get_spark, log_step

RAW_FIELDS = ['visit_id', 'name', 'date_visited', 'nature_of_visit', 'teeth_operated', 'fee']

SCHEMA = T.StructType(
    [
        T.StructField('visit_id', T.StringType(), False),
        T.StructField('name', T.StringType(), False),
        T.StructField('date_visited', T.DateType(), False),
        T.StructField('nature_of_visit', T.StringType(), False),
        T.StructField('teeth_operated', T.ArrayType(T.StringType()), False),
        T.StructField('fee', T.DoubleType(), False),
    ]
)


def extract():
    """Read visits with pymongo, dropping `_id` before Spark sees the data."""
    projection = {f: 1 for f in RAW_FIELDS} | {'_id': 0}
    rows = []
    for doc in get_db().visits.find({}, projection):
        rows.append(
            (
                doc['visit_id'],
                doc['name'],
                doc['date_visited'].date(),
                doc['nature_of_visit'],
                list(doc.get('teeth_operated') or []),
                float(doc['fee']),
            )
        )
    return rows


def run_etl(as_of=None):
    """Return (clean_df, report). `as_of` is the cutoff date, default today."""
    as_of = as_of or date.today()
    spark = get_spark()
    report = {'as_of': as_of.isoformat()}

    rows = extract()
    df = spark.createDataFrame(rows, SCHEMA)
    report['rows_loaded'] = df.count()
    log_step('extract', rows=report['rows_loaded'])

    # Exact duplicate rows are double entries: keep one copy.
    deduped = df.dropDuplicates(RAW_FIELDS)
    report['duplicates_dropped'] = report['rows_loaded'] - deduped.count()
    log_step('drop_exact_duplicates', dropped=report['duplicates_dropped'])

    # Visits dated after the run date cannot have happened yet.
    past = deduped.filter(F.col('date_visited') <= F.lit(as_of))
    report['future_rows_dropped'] = deduped.count() - past.count()
    log_step('drop_future_dates', dropped=report['future_rows_dropped'], cutoff=as_of)

    # No patient ID exists yet: identify a patient by normalized name.
    clean = past.withColumn(
        'patient_key', F.lower(F.regexp_replace(F.trim('name'), r'\s+', ' '))
    )

    # Likely duplicates: the same normalized name written in more than one way.
    spellings = clean.groupBy('patient_key').agg(F.countDistinct('name').alias('n'))
    report['likely_duplicate_patients'] = spellings.filter('n > 1').count()

    clean = clean.repartition(4, 'patient_key').cache()  # Unit: distributed processing
    report['rows_clean'] = clean.count()
    report['visits_clean'] = clean.select('visit_id').distinct().count()
    report['patients_clean'] = clean.select('patient_key').distinct().count()
    log_step(
        'clean',
        rows=report['rows_clean'],
        visits=report['visits_clean'],
        patients=report['patients_clean'],
        likely_duplicate_patients=report['likely_duplicate_patients'],
    )
    return clean, report


def explode_teeth(df):
    """One row per tooth for tooth-level analysis; N/A visits keep a null tooth."""
    return df.withColumn('tooth', F.explode_outer('teeth_operated')).drop('teeth_operated')
