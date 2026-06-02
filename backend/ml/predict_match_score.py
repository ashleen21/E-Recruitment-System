import argparse
import json
import os
import sys

import joblib
import pandas as pd


def _normalize_text(value):
    if value is None:
        return ""
    return str(value)


def _build_row(payload, text_cols, numeric_cols):
    row = {}
    for col in text_cols:
        row[col] = _normalize_text(payload.get(col, ""))
    for col in numeric_cols:
        row[col] = payload.get(col)
    return row


def _combine_text(row, text_cols):
    parts = [row.get(col, "") for col in text_cols]
    return "\n".join(parts)


def load_model(model_path):
    bundle = joblib.load(model_path)
    if isinstance(bundle, dict) and "pipeline" in bundle:
        return bundle["pipeline"], bundle.get("metadata", {})
    return bundle, {}


def main():
    parser = argparse.ArgumentParser(description="Predict match score")
    parser.add_argument("--model", required=True, help="Path to model joblib")
    parser.add_argument("--payload", help="JSON payload string")
    args = parser.parse_args()

    if not os.path.exists(args.model):
        print(json.dumps({"error": "model_not_found"}))
        sys.exit(1)

    if args.payload:
        payload = json.loads(args.payload)
    else:
        payload = json.loads(sys.stdin.read())

    pipeline, metadata = load_model(args.model)
    text_cols = metadata.get("text_columns", [
        "resume_text",
        "job_description_text",
        "candidate_skills",
        "required_skills",
        "candidate_education",
        "required_education",
    ])
    numeric_cols = metadata.get("numeric_columns", [
        "candidate_experience_years",
        "required_experience_years",
        "previous_jobs_count",
        "skill_match_score",
        "experience_match_score",
        "education_match_score",
    ])

    row = _build_row(payload, text_cols, numeric_cols)
    row["_combined_text"] = _combine_text(row, text_cols)

    features = ["_combined_text"] + [c for c in numeric_cols]
    df = pd.DataFrame([row])[features]

    target_type = metadata.get("target_type", "regression")

    if target_type == "classification" and hasattr(pipeline, "predict_proba"):
        proba = pipeline.predict_proba(df)[0]
        classes = getattr(pipeline, "classes_", [0, 1])
        score = 0.0
        if 1 in classes:
            score = proba[list(classes).index(1)]
        else:
            score = max(proba)
        score = float(score) * 100.0
    else:
        score = float(pipeline.predict(df)[0])

    score = max(0.0, min(100.0, score))

    result = {
        "score": score,
        "metadata": {
            "target_type": metadata.get("target_type", "regression"),
            "version": metadata.get("version", "unknown"),
        },
    }

    print(json.dumps(result))


if __name__ == "__main__":
    main()
