"""Revenue optimization: monthly revenue and service-demand forecast (Random Forest)
and frequent service combinations (Apriori)."""

import math
from datetime import date

import numpy as np
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder
from pyspark.ml.feature import StringIndexer
from pyspark.sql import Window
from pyspark.sql import functions as F
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

from .common import get_spark, log_step, save_result

SEED = 42
TEST_MONTHS = 6
HORIZON = 3
LAGS = 3
TARGETS = {'revenue': 'Revenue', 'cases': 'Cases'}
FEATURES = ['service_idx', 'month_sin', 'month_cos', 't', 'lag1', 'lag2', 'lag3', 'roll3']
FEATURE_LABELS = {
    'service_idx': 'Service',
    'month_sin': 'Time of year (sin)',
    'month_cos': 'Time of year (cos)',
    't': 'Trend (month number)',
    'lag1': 'Last month',
    'lag2': '2 months ago',
    'lag3': '3 months ago',
    'roll3': 'Average of last 3 months',
}
MIN_SUPPORT = 0.03
MIN_CONFIDENCE = 0.2


def month_start(d):
    return date(d.year, d.month, 1)


def add_months(d, n):
    m = d.month - 1 + n
    return date(d.year + m // 12, m % 12 + 1, 1)


def last_complete_month(as_of):
    """The month containing `as_of` only counts if `as_of` is its last day."""
    nxt = add_months(month_start(as_of), 1)
    return month_start(as_of) if (nxt - as_of).days == 1 else add_months(month_start(as_of), -1)


# ---------------------------------------------------------------- monthly series (Spark)


def monthly_series(clean, last_month):
    """Revenue and cases per service per month, with zero-filled gaps (Unit: Spark SQL / ETL)."""
    spark = get_spark()
    monthly = (
        clean.withColumn('month', F.trunc('date_visited', 'month'))
        .filter(F.col('month') <= F.lit(last_month))
        .groupBy('month', 'nature_of_visit')
        .agg(F.sum('fee').alias('revenue'), F.count('*').alias('cases'))
    )
    first = monthly.agg(F.min('month')).first()[0]
    months = spark.range(1).select(
        F.explode(F.sequence(F.lit(first), F.lit(last_month), F.expr('interval 1 month'))).alias('month')
    )
    services = clean.select('nature_of_visit').distinct()
    grid = months.crossJoin(services)
    full = grid.join(monthly, ['month', 'nature_of_visit'], 'left').fillna(0, ['revenue', 'cases'])
    return full, first


def build_features(series, target, first_month):
    """Lag features per service with Spark window functions; no future values leak in."""
    w = Window.partitionBy('nature_of_visit').orderBy('month')
    df = series.withColumn('y', F.col(target).cast('double'))
    for k in range(1, LAGS + 1):
        df = df.withColumn(f'lag{k}', F.lag('y', k).over(w))
    df = (
        df.withColumn('roll3', F.avg('y').over(w.rowsBetween(-LAGS, -1)))
        .withColumn('moy', F.month('month'))
        .withColumn('month_sin', F.sin(2 * math.pi * F.col('moy') / 12))
        .withColumn('month_cos', F.cos(2 * math.pi * F.col('moy') / 12))
        .withColumn('t', F.months_between('month', F.lit(first_month)).cast('int'))
    )
    indexer = StringIndexer(inputCol='nature_of_visit', outputCol='service_idx', stringOrderType='alphabetAsc')
    df = indexer.fit(df).transform(df)  # Unit: AI-ready dataset prep (StringIndexer)
    return df.toPandas()


# ---------------------------------------------------------------- forecasting


def metrics_for(y_true, y_pred):
    return {
        'mae': round(float(mean_absolute_error(y_true, y_pred)), 2),
        'rmse': round(float(math.sqrt(mean_squared_error(y_true, y_pred))), 2),
    }


def new_model():
    return RandomForestRegressor(
        n_estimators=300, min_samples_leaf=3, random_state=SEED, n_jobs=-1
    )


def evaluate_target(pdf, target):
    """Time-based split: train on earlier months, test on the last TEST_MONTHS months."""
    data = pdf.dropna(subset=['lag1', 'lag2', 'lag3']).copy()
    months = sorted(data['month'].unique())
    test_months = months[-TEST_MONTHS:]
    train = data[~data['month'].isin(test_months)]
    test = data[data['month'].isin(test_months)].copy()

    model = new_model().fit(train[FEATURES], train['y'])
    test['pred'] = model.predict(test[FEATURES])
    test['naive'] = test['lag1']
    train_mean = train.groupby('nature_of_visit')['y'].mean()
    test['mean_baseline'] = test['nature_of_visit'].map(train_mean)

    totals = test.groupby('month')[['y', 'pred', 'naive', 'mean_baseline']].sum().reset_index()
    result = {
        'train_months': len(months) - TEST_MONTHS,
        'test_months': TEST_MONTHS,
        'train_rows': int(len(train)),
        'test_rows': int(len(test)),
        'per_service': {
            'random_forest': metrics_for(test['y'], test['pred']),
            'last_month_baseline': metrics_for(test['y'], test['naive']),
            'average_baseline': metrics_for(test['y'], test['mean_baseline']),
        },
        'monthly_total': {
            'random_forest': metrics_for(totals['y'], totals['pred']),
            'last_month_baseline': metrics_for(totals['y'], totals['naive']),
            'average_baseline': metrics_for(totals['y'], totals['mean_baseline']),
        },
    }
    return result, totals


def forecast_target(pdf, target):
    """Refit on all complete months, then forecast HORIZON months ahead recursively."""
    data = pdf.dropna(subset=['lag1', 'lag2', 'lag3'])
    model = new_model().fit(data[FEATURES], data['y'])
    importance = sorted(
        zip(FEATURES, model.feature_importances_), key=lambda kv: kv[1], reverse=True
    )

    history = {s: list(g.sort_values('month')['y']) for s, g in pdf.groupby('nature_of_visit')}
    index = pdf.drop_duplicates('nature_of_visit').set_index('nature_of_visit')['service_idx']
    last = max(pdf['month'])
    t_last = int(pdf['t'].max())

    rows = []
    for step in range(1, HORIZON + 1):
        month = add_months(last, step)
        feats = []
        for service, hist in history.items():
            feats.append(
                {
                    'service': service,
                    'service_idx': index[service],
                    'month_sin': math.sin(2 * math.pi * month.month / 12),
                    'month_cos': math.cos(2 * math.pi * month.month / 12),
                    't': t_last + step,
                    'lag1': hist[-1],
                    'lag2': hist[-2],
                    'lag3': hist[-3],
                    'roll3': float(np.mean(hist[-LAGS:])),
                }
            )
        frame = pd.DataFrame(feats)
        preds = np.clip(model.predict(frame[FEATURES]), 0, None)
        for service, value in zip(frame['service'], preds):
            history[service].append(float(value))
            rows.append({'month': month, 'service': service, target: float(value)})
    return pd.DataFrame(rows), importance


# ---------------------------------------------------------------- association rules


def service_rules(clean):
    """Apriori on patient baskets: every service a patient has had is one basket.

    Most visits hold a single service, so visit-level baskets carry too little signal.
    """
    baskets = (
        clean.groupBy('patient_key')
        .agg(F.collect_set('nature_of_visit').alias('services'))
        .toPandas()['services']
        .map(sorted)
        .tolist()
    )
    visit_sizes = clean.groupBy('visit_id').agg(F.countDistinct('nature_of_visit').alias('n'))
    multi_visits = visit_sizes.filter('n > 1').count()

    enc = TransactionEncoder()
    onehot = pd.DataFrame(enc.fit(baskets).transform(baskets), columns=enc.columns_)
    itemsets = apriori(onehot, min_support=MIN_SUPPORT, use_colnames=True)
    rules = association_rules(itemsets, metric='confidence', min_threshold=MIN_CONFIDENCE)
    rules = rules[rules['lift'] > 1].sort_values(['lift', 'confidence'], ascending=False)

    out = [
        {
            'if': sorted(r.antecedents),
            'then': sorted(r.consequents),
            'support': round(float(r.support), 4),
            'confidence': round(float(r.confidence), 4),
            'lift': round(float(r.lift), 3),
            'patients': int(round(r.support * len(baskets))),
        }
        for r in rules.itertuples()
    ]
    top_itemsets = [
        {'services': sorted(s), 'support': round(float(v), 4), 'patients': int(round(v * len(baskets)))}
        for s, v in itemsets.sort_values('support', ascending=False)[['itemsets', 'support']].values
        if len(s) > 1
    ][:15]
    info = {
        'baskets': len(baskets),
        'basket_level': 'patient',
        'multi_service_visits': multi_visits,
        'min_support': MIN_SUPPORT,
        'min_confidence': MIN_CONFIDENCE,
        'min_lift': 1.0,
        'itemsets': int(len(itemsets)),
        'rules': len(out),
    }
    return out, top_itemsets, info


# ---------------------------------------------------------------- entry point


def run_revenue(clean, etl_report, as_of):
    last_month = last_complete_month(as_of)
    series, first_month = monthly_series(clean, last_month)
    series = series.cache()
    n_months = series.select('month').distinct().count()
    n_services = series.select('nature_of_visit').distinct().count()
    log_step('monthly_series', months=n_months, services=n_services, last_month=last_month)
    if n_months < LAGS + TEST_MONTHS + 6:
        raise ValueError(f'Need at least {LAGS + TEST_MONTHS + 6} complete months, have {n_months}')

    evaluation, forecasts, importances, test_totals = {}, {}, {}, None
    for target in TARGETS:
        pdf = build_features(series, target, first_month)
        if target == 'revenue':
            log_step('forecast_features', rows=len(pdf), features=FEATURES)
        evaluation[target], totals = evaluate_target(pdf, target)
        if target == 'revenue':
            test_totals = totals
        forecasts[target], importances[target] = forecast_target(pdf, target)
    rf, naive = (evaluation['revenue']['monthly_total'][k]['mae'] for k in ('random_forest', 'last_month_baseline'))
    log_step(
        'random_forest',
        train_months=evaluation['revenue']['train_months'],
        test_months=TEST_MONTHS,
        mae=rf,
        naive_mae=naive,
    )

    hist = series.groupBy('month').agg(F.sum('revenue').alias('revenue'), F.sum('cases').alias('cases'))
    hist = hist.orderBy('month').toPandas()
    fc = forecasts['revenue'].merge(forecasts['cases'], on=['month', 'service'])
    fc_total = fc.groupby('month')[['revenue', 'cases']].sum().reset_index()
    log_step('forecast', months=[m.isoformat() for m in fc_total['month']])

    last_actual = (
        series.filter(F.col('month') == F.lit(last_month)).toPandas().set_index('nature_of_visit')
    )
    next_month = fc[fc['month'] == fc['month'].min()].set_index('service')
    services = []
    for s in sorted(next_month.index):
        prev = float(last_actual.loc[s, 'revenue'])
        nxt = float(next_month.loc[s, 'revenue'])
        services.append(
            {
                'service': s,
                'last_month_revenue': round(prev, 2),
                'last_month_cases': int(last_actual.loc[s, 'cases']),
                'forecast_revenue': round(nxt, 2),
                'forecast_cases': round(float(next_month.loc[s, 'cases']), 1),
                'change': round((nxt - prev) / prev, 4) if prev else None,
            }
        )
    services.sort(key=lambda r: r['forecast_revenue'], reverse=True)

    rules, itemsets, rules_info = service_rules(clean)
    log_step('apriori', baskets=rules_info['baskets'], itemsets=rules_info['itemsets'], rules=rules_info['rules'])

    band = evaluation['revenue']['monthly_total']['random_forest']['mae']
    payload = {
        'as_of': as_of.isoformat(),
        'last_complete_month': last_month.isoformat(),
        'history': [
            {'month': r.month.isoformat(), 'revenue': round(float(r.revenue), 2), 'cases': int(r.cases)}
            for r in hist.itertuples()
        ],
        'forecast': [
            {
                'month': r.month.isoformat(),
                'revenue': round(float(r.revenue), 2),
                'cases': round(float(r.cases), 1),
                'low': round(max(0.0, float(r.revenue) - band), 2),
                'high': round(float(r.revenue) + band, 2),
            }
            for r in fc_total.itertuples()
        ],
        'test_check': [
            {
                'month': pd.Timestamp(r.month).date().isoformat(),
                'actual': round(float(r.y), 2),
                'random_forest': round(float(r.pred), 2),
                'last_month': round(float(r.naive), 2),
            }
            for r in test_totals.itertuples()
        ],
        'services': services,
        'feature_importance': [
            {'feature': FEATURE_LABELS[f], 'importance': round(float(v), 4)}
            for f, v in importances['revenue']
        ],
        'rules': rules,
        'itemsets': itemsets,
    }
    metrics = {
        'forecast': {
            'algorithm': 'Random Forest Regressor (scikit-learn)',
            'split': f'time-based: last {TEST_MONTHS} complete months held out',
            'features': [FEATURE_LABELS[f] for f in FEATURES],
            'horizon_months': HORIZON,
            'revenue': evaluation['revenue'],
            'cases': evaluation['cases'],
        },
        'rules': {'algorithm': 'Apriori (mlxtend)', **rules_info},
        'etl': etl_report,
    }
    result_id = save_result('revenue', payload, metrics)
    log_step('saved', type='revenue', result_id=result_id)
    return payload, metrics
