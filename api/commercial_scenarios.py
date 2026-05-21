from __future__ import annotations

"""Commercial value scenarios for revenue-neutral millage (no commercial AVM estimates)."""

from typing import Final

import pandas as pd

COUNTY_JURISDICTION_NAME: Final = "Allegheny County"

# Estimated commercial growth (often below residential); low/high bands are ±20 pp.
ESTIMATED_COMMERCIAL_GROWTH: Final = 0.20
DEFAULT_SCENARIO_ID: Final = "baseline"

# Total growth applied to aggregate commercial assessed value per scenario.
SCENARIO_GROWTH_RATES: Final[dict[str, float]] = {
    "commercial_low": 0.0,  # +0% (low bound)
    "baseline": ESTIMATED_COMMERCIAL_GROWTH,  # +20% (estimated)
    "commercial_high": ESTIMATED_COMMERCIAL_GROWTH + 0.20,  # +40% (high bound)
}

SCENARIO_LABELS: Final[dict[str, str]] = {
    "commercial_low": "Commercial assessed values unchanged (low bound)",
    "baseline": "Commercial assessed values +20% (estimated)",
    "commercial_high": "Commercial assessed values +40% (high bound)",
}

SCENARIO_SHORT_LABELS: Final[dict[str, str]] = {
    "commercial_low": "Low (0%)",
    "baseline": "Estimated (+20%)",
    "commercial_high": "High (+40%)",
}


def commercial_future_value(commercial_current: float, growth_rate: float) -> float:
    if commercial_current <= 0:
        return 0.0
    return commercial_current * (1.0 + growth_rate)


def load_commercial_valuations(path: str | pd.PathLike) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str, low_memory=False)
    df = df.rename(columns={"PARCEL_ID": "parcel_id"})
    df["current_assessment_total"] = pd.to_numeric(df["CURRENT_ASSESSMENT_TOTAL"], errors="coerce").fillna(0)
    df["municipality"] = df["MUNICIPALITY"].astype(str).str.strip()
    df["school_district"] = df["SCHOOL_DISTRICT"].astype(str).str.strip()
    return df[df["current_assessment_total"] > 0]


def _commercial_current_sums(commercial: pd.DataFrame) -> tuple[dict[str, float], dict[str, float], float]:
    muni = commercial.groupby("municipality")["current_assessment_total"].sum().to_dict()
    school = commercial.groupby("school_district")["current_assessment_total"].sum().to_dict()
    county = float(commercial["current_assessment_total"].sum())
    return (
        {str(k).strip(): float(v) for k, v in muni.items()},
        {str(k).strip(): float(v) for k, v in school.items()},
        county,
    )


def revenue_neutral_factor(current_taxable_sum: float, future_taxable_sum: float) -> float:
    """
    Scale post-reassessment millage for one taxing body so aggregate receipts are unchanged.

    With a single nominal rate per jurisdiction, total tax = mills/1000 * sum(taxable).
    effective_mills = nominal_mills * factor, so:
      sum(future_taxable) * nominal * factor = sum(current_taxable) * nominal
    when factor = current_sum / future_sum.
    """
    if future_taxable_sum <= 0:
        return 1.0
    return current_taxable_sum / future_taxable_sum


def build_scenario_tax_aggregates(
    residential: pd.DataFrame,
    commercial: pd.DataFrame,
) -> tuple[pd.DataFrame, dict[str, dict[str, dict[str, float]]]]:
    """
    Build revenue-neutral millage factors separately for each taxing body.

    - County: all county-taxable assessments (residential + commercial) countywide.
    - Municipality: local-taxable sums within each municipality (res + commercial in that muni).
    - School district: local-taxable sums within each school district.

    Factors are NOT shared across taxing bodies; each body's pre/post aggregate taxable
    totals determine its own factor. Residential future values are modeled; commercial
    uses fixed growth bands per scenario.
    """
    comm_muni, comm_school, comm_county = _commercial_current_sums(commercial)

    res_county_cur = float(residential["county_taxable_current"].sum())
    res_county_fut = float(residential["county_taxable_future"].sum())

    res_muni_cur = residential.groupby("municipality")["local_taxable_current"].sum()
    res_muni_fut = residential.groupby("municipality")["local_taxable_future"].sum()
    res_school_cur = residential.groupby("school_district")["local_taxable_current"].sum()
    res_school_fut = residential.groupby("school_district")["local_taxable_future"].sum()

    rows: list[dict[str, object]] = []
    json_out: dict[str, dict[str, dict[str, float]]] = {
        scenario: {"county": {}, "municipality": {}, "school_district": {}}
        for scenario in SCENARIO_GROWTH_RATES
    }

    for scenario, growth in SCENARIO_GROWTH_RATES.items():
        county_fut = res_county_fut + commercial_future_value(comm_county, growth)
        county_cur = res_county_cur + comm_county
        county_factor = revenue_neutral_factor(county_cur, county_fut)
        rows.append(
            {
                "scenario": scenario,
                "jurisdiction_type": "county",
                "jurisdiction_name": COUNTY_JURISDICTION_NAME,
                "current_taxable_sum": county_cur,
                "future_taxable_sum": county_fut,
                "revenue_neutral_factor": county_factor,
            }
        )
        json_out[scenario]["county"][COUNTY_JURISDICTION_NAME] = county_factor

        all_munis = set(res_muni_cur.index.astype(str).str.strip()) | set(comm_muni.keys())
        for muni in all_munis:
            if not muni or muni == "nan":
                continue
            r_cur = float(res_muni_cur.get(muni, 0) or 0)
            r_fut = float(res_muni_fut.get(muni, 0) or 0)
            c_cur = comm_muni.get(muni, 0.0)
            cur = r_cur + c_cur
            fut = r_fut + commercial_future_value(c_cur, growth)
            factor = revenue_neutral_factor(cur, fut)
            rows.append(
                {
                    "scenario": scenario,
                    "jurisdiction_type": "municipality",
                    "jurisdiction_name": muni,
                    "current_taxable_sum": cur,
                    "future_taxable_sum": fut,
                    "revenue_neutral_factor": factor,
                }
            )
            json_out[scenario]["municipality"][muni] = factor

        all_schools = set(res_school_cur.index.astype(str).str.strip()) | set(comm_school.keys())
        for school in all_schools:
            if not school or school == "nan":
                continue
            r_cur = float(res_school_cur.get(school, 0) or 0)
            r_fut = float(res_school_fut.get(school, 0) or 0)
            c_cur = comm_school.get(school, 0.0)
            cur = r_cur + c_cur
            fut = r_fut + commercial_future_value(c_cur, growth)
            factor = revenue_neutral_factor(cur, fut)
            rows.append(
                {
                    "scenario": scenario,
                    "jurisdiction_type": "school_district",
                    "jurisdiction_name": school,
                    "current_taxable_sum": cur,
                    "future_taxable_sum": fut,
                    "revenue_neutral_factor": factor,
                }
            )
            json_out[scenario]["school_district"][school] = factor

    return pd.DataFrame(rows), json_out
