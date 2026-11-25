"""Area 1: patient retention segments with K-Means on recency, frequency and spend."""

import numpy as np
from pyspark.sql import functions as F
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

from .common import log_step, save_result

K = 3  # frequent, infrequent, inactive
K_SCAN = range(2, 7)
SEED = 42
FEATURES = ['recency_days', 'frequency', 'log_monetary']

STRATEGIES = {
    'Frequent': 'Keep them engaged: thank-you messages, reminders for routine cleaning, '
    'priority scheduling.',
    'Infrequent': 'Nudge them back: recall reminders at 6 months, highlight preventive '
    'services such as cleaning and fluoride.',
    'Inactive': 'Win them back: personal follow-up call or message, check whether they '
    'need a check-up or have pending treatment.',
}


def build_features(clean, as_of):
    """One row per patient, built with Spark aggregations (Unit: Spark SQL / ETL).

    Name and contact number are carried only for the owner's follow-up list, never as features.
    """
    per_patient = clean.groupBy('patient_key').agg(
        F.first('name').alias('name'),
        F.first('contact_number').alias('contact_number'),
        F.max('date_visited').alias('last_visit'),
        F.min('date_visited').alias('first_visit'),
        F.countDistinct('visit_id').alias('frequency'),
        F.sum('fee').alias('monetary'),
    )
    per_patient = per_patient.withColumn(
        'recency_days', F.datediff(F.lit(as_of), F.col('last_visit'))
    ).withColumn('log_monetary', F.log1p('monetary'))
    return per_patient.toPandas()


def label_clusters(df):
    """Name clusters from their centroids: most recent-gap is Inactive, then by frequency."""
    centroids = df.groupby('cluster')[['recency_days', 'frequency']].mean()
    inactive = centroids['recency_days'].idxmax()
    rest = centroids.drop(index=inactive).sort_values('frequency', ascending=False)
    names = {inactive: 'Inactive', rest.index[0]: 'Frequent'}
    for c in rest.index[1:]:
        names[c] = 'Infrequent'
    return df['cluster'].map(names)


def run_retention(clean, etl_report, as_of):
    pdf = build_features(clean, as_of)
    log_step('features', patients=len(pdf), features=FEATURES)

    x = StandardScaler().fit_transform(pdf[FEATURES].to_numpy(dtype=float))

    scan = {}
    for k in K_SCAN:
        labels = KMeans(n_clusters=k, n_init=10, random_state=SEED).fit_predict(x)
        scan[k] = round(float(silhouette_score(x, labels)), 4)
    log_step('k_scan', silhouette_by_k=scan)

    model = KMeans(n_clusters=K, n_init=10, random_state=SEED).fit(x)
    pdf['cluster'] = model.labels_
    pdf['segment'] = label_clusters(pdf)
    silhouette = float(silhouette_score(x, model.labels_))
    log_step('kmeans', k=K, silhouette=round(silhouette, 4), inertia=round(model.inertia_, 2))

    segments = []
    for name in ['Frequent', 'Infrequent', 'Inactive']:
        part = pdf[pdf['segment'] == name]
        segments.append(
            {
                'segment': name,
                'patients': int(len(part)),
                'share': round(len(part) / len(pdf), 4),
                'avg_recency_days': round(float(part['recency_days'].mean()), 1),
                'avg_visits': round(float(part['frequency'].mean()), 2),
                'avg_total_fee': round(float(part['monetary'].mean()), 2),
                'total_revenue': round(float(part['monetary'].sum()), 2),
                'strategy': STRATEGIES[name],
            }
        )

    patients = [
        {
            'patient_id': r.patient_key,
            'name': r.name,
            'contact_number': r.contact_number,
            'segment': r.segment,
            'last_visit': r.last_visit.isoformat(),
            'visits': int(r.frequency),
            'total_fee': round(float(r.monetary), 2),
            'recency_days': int(r.recency_days),
        }
        for r in pdf.sort_values(['segment', 'recency_days']).itertuples()
    ]

    metrics = {
        'algorithm': 'K-Means (scikit-learn)',
        'k': K,
        'features': FEATURES,
        'scaling': 'StandardScaler',
        'silhouette': round(silhouette, 4),
        'silhouette_by_k': {str(k): v for k, v in scan.items()},
        'inertia': round(float(model.inertia_), 2),
        'etl': etl_report,
    }
    payload = {'as_of': as_of.isoformat(), 'segments': segments, 'patients': patients}
    result_id = save_result('retention', payload, metrics)
    log_step('saved', type='retention', result_id=result_id)
    return payload, metrics
