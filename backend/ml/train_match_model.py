import argparse
import json
import os
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, r2_score
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer

DEFAULT_TEXT_COLS = [
    "resume_text",
    "job_description_text",
    "candidate_skills",
    "required_skills",
    "candidate_education",
    "required_education",
]

DEFAULT_NUMERIC_COLS = [
    "candidate_experience_years",
    "required_experience_years",
    "previous_jobs_count",
    "skill_match_score",
    "experience_match_score",
    "education_match_score",
]


def _normalize_text(value):
    if pd.isna(value):
        return ""
    return str(value)


def _build_text_feature(df, text_cols):
    parts = []
    for col in text_cols:
        if col in df.columns:
            parts.append(df[col].apply(_normalize_text))
        else:
            parts.append(pd.Series([""] * len(df)))
    combined = parts[0]
    for part in parts[1:]:
        combined = combined + "\n" + part
    return combined


def load_dataset(path):
    df = pd.read_csv(path)
    df.columns = [c.strip() for c in df.columns]
    return df


def train_model(df, output_path, random_state=42, test_size=0.2):
    text_cols = DEFAULT_TEXT_COLS
    numeric_cols = DEFAULT_NUMERIC_COLS

    df = df.copy()
    df["_combined_text"] = _build_text_feature(df, text_cols)

    numeric_df = df[[c for c in numeric_cols if c in df.columns]].copy()

    if "overall_match_score" in df.columns and df["overall_match_score"].notna().any():
        target_col = "overall_match_score"
        target_type = "regression"
    elif "match_label" in df.columns:
        target_col = "match_label"
        target_type = "classification"
    else:
        raise ValueError("Dataset must include overall_match_score or match_label.")

    y = df[target_col]

    text_transformer = TfidfVectorizer(
        max_features=40000,
        ngram_range=(1, 2),
        min_df=2,
    )

    numeric_transformer = Pipeline(
        steps=[
            ("imputer", SimpleImputer(strategy="median")),
        ]
    )

    preprocessor = ColumnTransformer(
        transformers=[
            ("text", text_transformer, "_combined_text"),
            ("num", numeric_transformer, [c for c in numeric_cols if c in df.columns]),
        ],
        remainder="drop",
        sparse_threshold=0.3,
    )

    if target_type == "regression":
        model = RandomForestRegressor(
            n_estimators=300,
            random_state=random_state,
            n_jobs=-1,
        )
    else:
        model = RandomForestClassifier(
            n_estimators=300,
            random_state=random_state,
            n_jobs=-1,
            class_weight="balanced",
        )

    pipeline = Pipeline(
        steps=[
            ("preprocessor", preprocessor),
            ("model", model),
        ]
    )

    # Train/validation split
    mask = np.random.RandomState(random_state).rand(len(df)) >= test_size
    train_df = df[mask]
    val_df = df[~mask]

    x_train = train_df[["_combined_text"] + [c for c in numeric_cols if c in df.columns]]
    y_train = train_df[target_col]
    x_val = val_df[["_combined_text"] + [c for c in numeric_cols if c in df.columns]]
    y_val = val_df[target_col]

    pipeline.fit(x_train, y_train)

    metrics = {}
    if len(val_df) > 0:
        preds = pipeline.predict(x_val)
        if target_type == "regression":
            metrics["mae"] = float(mean_absolute_error(y_val, preds))
            metrics["r2"] = float(r2_score(y_val, preds))
        else:
            metrics["accuracy"] = float(accuracy_score(y_val, preds))
            metrics["f1"] = float(f1_score(y_val, preds, average="weighted"))

    metadata = {
        "target_type": target_type,
        "target_column": target_col,
        "trained_at": datetime.utcnow().isoformat() + "Z",
        "text_columns": text_cols,
        "numeric_columns": [c for c in numeric_cols if c in df.columns],
        "metrics": metrics,
        "version": "1.0.0",
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    joblib.dump({"pipeline": pipeline, "metadata": metadata}, output_path)

    return metadata


def main():
    parser = argparse.ArgumentParser(description="Train match score model")
    parser.add_argument("--data", required=True, help="Path to training CSV")
    parser.add_argument("--output", required=True, help="Path to save model joblib")
    parser.add_argument("--random-state", type=int, default=42)
    parser.add_argument("--test-size", type=float, default=0.2)
    args = parser.parse_args()

    df = load_dataset(args.data)
    metadata = train_model(
        df,
        output_path=args.output,
        random_state=args.random_state,
        test_size=args.test_size,
    )

    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
