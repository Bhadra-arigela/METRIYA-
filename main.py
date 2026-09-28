from fastapi import FastAPI, File, UploadFile

from fastapi.responses import FileResponse

from fastapi.middleware.cors import CORSMiddleware

from PIL import Image, ImageOps, ImageEnhance, ImageFilter

import io

import re

import os
import pytesseract
from concurrent.futures import ThreadPoolExecutor

import json
import sqlite3
import uuid
from datetime import datetime, timezone
from pathlib import Path
import numpy as np
import cv2

from rapidocr import RapidOCR

# ============================================================
# MACHINE LEARNING - FIELD EXTRACTION
# ============================================================
# ML is used after OCR to classify unstructured label text into
# declaration fields. The legal compliance decision remains
# deterministic and is handled by calculate_compliance().
try:
    from ml_field_extractor import (
        extract_ml_fields,
        MODEL_VERSION as ML_MODEL_VERSION,
        ML_FIELD_EXTRACTOR,
    )
    ML_FIELD_EXTRACTION_AVAILABLE = True
except Exception as ml_import_error:
    print("[ML] Field extractor unavailable:", ml_import_error)
    ML_FIELD_EXTRACTION_AVAILABLE = False
    ML_MODEL_VERSION = "unavailable"
    ML_FIELD_EXTRACTOR = None


try:
    from reportlab.lib.pagesizes import A4
    from reportlab.pdfgen import canvas
    REPORTLAB_AVAILABLE = True
except Exception:
    REPORTLAB_AVAILABLE = False


# ============================================================
# METRIYA - LEGAL METROLOGY INSPECTION & COMPLIANCE SYSTEM
# MASTER / STABLE BACKEND
# ============================================================
#
# IMAGE
#   ↓
# OCR
#   ↓
# RAW TEXT
#   ↓
# FIELD EXTRACTION
#   ↓
# RULE ENGINE
#   ↓
# COMPLIANCE RESULT
#
# Important:
# OCR missing information is NOT automatically treated as
# a confirmed legal violation.
#
# Statuses:
#   PASS
#   FAIL
#   NOT_DETECTED
#   REVIEW_REQUIRED
#
# ============================================================


# ============================================================
# APPLICATION
# ============================================================

app = FastAPI(
    title="METRIYA - Legal Metrology Inspection & Compliance System",
    version="5.2"
)


# ============================================================
# CORS
# ============================================================

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# BACKEND CONFIGURATION / DATABASE
# ============================================================

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = Path(os.getenv("LMCC_DB_PATH", DATA_DIR / "lmcc.db"))
MAX_IMAGE_BYTES = int(os.getenv("LMCC_MAX_IMAGE_MB", "10")) * 1024 * 1024

ALLOWED_IMAGE_TYPES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
}

DEMO_USERS = {
    "inspector.sharma@lmcc.gov.in": {
        "password": "password123",
        "name": "Inspector Sharma",
        "role": "inspector",
        "zone": "Zone 4",
    }
}


def db_connect():
    connection = sqlite3.connect(str(DB_PATH))
    connection.row_factory = sqlite3.Row
    return connection


def init_db():
    with db_connect() as connection:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS scans (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                inspector_email TEXT,
                inspector_name TEXT,
                product_name TEXT,
                status TEXT NOT NULL,
                detection_percentage INTEGER DEFAULT 0,
                confirmed_violations INTEGER DEFAULT 0,
                review_required INTEGER DEFAULT 0,
                number_of_images INTEGER DEFAULT 0,
                fields_json TEXT NOT NULL,
                compliance_json TEXT NOT NULL,
                raw_text TEXT,
                filenames_json TEXT
            )
        """)
        connection.commit()


init_db()


def iso_now():
    return datetime.now(timezone.utc).isoformat()


def create_scan_record(payload, inspector_email=None):
    scan_id = "LMCC-" + uuid.uuid4().hex[:10].upper()
    fields = payload.get("fields", {})
    compliance = payload.get("compliance", {})
    product_name = (fields.get("product_name") or {}).get("value")
    status = compliance.get("overall_status", "REVIEW_REQUIRED")

    with db_connect() as connection:
        connection.execute(
            """
            INSERT INTO scans (
                id, created_at, inspector_email, inspector_name,
                product_name, status, detection_percentage,
                confirmed_violations, review_required, number_of_images,
                fields_json, compliance_json, raw_text, filenames_json
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                scan_id,
                iso_now(),
                inspector_email,
                DEMO_USERS.get(inspector_email, {}).get("name"),
                product_name,
                status,
                int(compliance.get("detection_percentage", 0) or 0),
                int(compliance.get("confirmed_violation_count", 0) or 0),
                int(compliance.get("review_required_count", 0) or 0),
                int(payload.get("number_of_images", 0) or 0),
                json.dumps(fields),
                json.dumps(compliance),
                payload.get("raw_text", ""),
                json.dumps([
                    image.get("filename")
                    for image in payload.get("images", [])
                ]),
            ),
        )
        connection.commit()

    return scan_id


def scan_row_to_dict(row):
    if row is None:
        return None

    result = dict(row)
    for key in ("fields_json", "compliance_json", "filenames_json"):
        raw = result.pop(key, None)
        if raw:
            try:
                result[key.replace("_json", "")] = json.loads(raw)
            except Exception:
                result[key.replace("_json", "")] = raw
        else:
            result[key.replace("_json", "")] = {}
    return result


def list_scan_records(limit=50, offset=0, status=None):
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))

    query = """
        SELECT id, created_at, inspector_email, inspector_name,
               product_name, status, detection_percentage,
               confirmed_violations, review_required, number_of_images,
               fields_json, compliance_json, filenames_json
        FROM scans
    """
    params = []

    if status:
        query += " WHERE status = ?"
        params.append(status)

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
    params.extend([limit, offset])

    with db_connect() as connection:
        rows = connection.execute(query, params).fetchall()

    return [scan_row_to_dict(row) for row in rows]


def get_scan_record(scan_id):
    with db_connect() as connection:
        row = connection.execute(
            "SELECT * FROM scans WHERE id = ?",
            (scan_id,)
        ).fetchone()
    return scan_row_to_dict(row)


def get_dashboard_stats():
    with db_connect() as connection:
        total = connection.execute(
            "SELECT COUNT(*) FROM scans"
        ).fetchone()[0]

        compliant = connection.execute(
            "SELECT COUNT(*) FROM scans WHERE status = 'PASS'"
        ).fetchone()[0]

        failed = connection.execute(
            "SELECT COUNT(*) FROM scans WHERE status = 'FAIL'"
        ).fetchone()[0]

        review = connection.execute(
            "SELECT COUNT(*) FROM scans WHERE status = 'REVIEW_REQUIRED'"
        ).fetchone()[0]

        avg_detection = connection.execute(
            "SELECT COALESCE(AVG(detection_percentage), 0) FROM scans"
        ).fetchone()[0]

    return {
        "total_scans": total,
        "compliant_scans": compliant,
        "non_compliant_scans": failed,
        "review_required_scans": review,
        "average_detection_percentage": round(avg_detection or 0, 1),
    }


# ============================================================
# OCR ENGINE
# ============================================================

print("Loading RapidOCR...")

ocr_engine = RapidOCR()

print("RapidOCR loaded successfully.")

# ============================================================
# MULTI-OCR CONFIGURATION
# ============================================================

# Tesseract executable path.
# Can be overridden during deployment using TESSERACT_CMD.
TESSERACT_CMD = os.getenv(
    "TESSERACT_CMD",
    r"C:\Program Files\Tesseract-OCR\tesseract.exe"
)

if os.path.exists(TESSERACT_CMD):
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_CMD
    print(f"[OCR] Tesseract found: {TESSERACT_CMD}")
else:
    print(f"[OCR] WARNING: Tesseract not found: {TESSERACT_CMD}")


# PaddleOCR engine
PADDLE_OCR = None

try:
    from paddleocr import PaddleOCR

    PADDLE_OCR = PaddleOCR(
    lang="en",
    enable_mkldnn=False
)

    print("[OCR] PaddleOCR initialized successfully")

except Exception as e:
    print(f"[OCR] PaddleOCR initialization failed: {e}")

# ============================================================
# BASIC FIELD HELPERS
# ============================================================

def found(value):
    if value is None:
        return not_found()

    value = str(value).strip()

    if not value:
        return not_found()

    return {
        "value": value,
        "status": "FOUND"
    }


def not_found():
    return {
        "value": None,
        "status": "NOT_FOUND"
    }


def clean_spaces(value):
    if value is None:
        return ""

    value = str(value)

    value = re.sub(
        r"\s+",
        " ",
        value
    )

    return value.strip()


def clean_line(value):
    value = clean_spaces(value)

    value = value.strip(
        " \t\r\n|:;,."
    )

    return clean_spaces(value)


def unique_preserve(values):
    result = []
    seen = set()

    for value in values:

        value = clean_spaces(value)

        if not value:
            continue

        key = value.upper()

        if key in seen:
            continue

        seen.add(key)
        result.append(value)

    return result


# ============================================================
# IMAGE LOADING
# ============================================================

def load_image(data):
    image = Image.open(
        io.BytesIO(data)
    )

    image = ImageOps.exif_transpose(
        image
    )

    image = image.convert("RGB")

    max_dimension = 2400

    width, height = image.size

    if max(width, height) > max_dimension:

        scale = (
            max_dimension /
            max(width, height)
        )

        image = image.resize(
            (
                int(width * scale),
                int(height * scale)
            ),
            Image.Resampling.LANCZOS
        )

    return image


# ============================================================
# IMAGE PREPROCESSING
# ============================================================

def preprocess_variants(image):
    """
    FAST OCR preprocessing.

    Only two variants are used during normal scanning:
      1. original image
      2. mildly enhanced / upscaled image

    The previous version generated five variants for four
    rotations, which could trigger up to 20 OCR passes per
    uploaded image. That made scanning unnecessarily slow.
    """

    variants = [image]

    width, height = image.size

    # Mild upscale only. Avoid very large OCR images.
    scale = 1.35

    enhanced = image.resize(
        (
            min(int(width * scale), 3600),
            min(int(height * scale), 3600)
        ),
        Image.Resampling.LANCZOS
    )

    enhanced = ImageEnhance.Contrast(
        enhanced
    ).enhance(1.25)

    enhanced = ImageEnhance.Sharpness(
        enhanced
    ).enhance(1.20)

    variants.append(enhanced)

    # High-contrast grayscale variant helps with faint printed
    # batch/date text on glossy wrappers.
    try:
        gray = ImageOps.grayscale(enhanced)
        gray = ImageOps.autocontrast(gray)
        variants.append(gray.convert("RGB"))
    except Exception as error:
        print("Grayscale preprocessing error:", error)

    return variants


# ============================================================
# OCR ON ONE IMAGE
# ============================================================

def ocr_once(image):
    texts = []

    try:

        result = ocr_engine(
            np.array(image)
        )

        if result is None:
            return texts

        recognized = getattr(
            result,
            "txts",
            None
        )

        if recognized:

            for value in recognized:

                if value is None:
                    continue

                value = clean_spaces(
                    value
                )

                if value:
                    texts.append(
                        value
                    )

    except Exception as error:

        print(
            "OCR error:",
            error
        )

    return texts

# ============================================================
# MULTI-OCR ENGINE LAYER
# RapidOCR + PaddleOCR + Tesseract
# ============================================================

def run_rapidocr_engine(image):
    result = {
        "engine": "rapidocr",
        "available": True,
        "text": "",
        "lines": [],
        "error": None
    }

    try:
        img_array = np.array(image)

        output = ocr_engine(img_array)

        # RapidOCR may return None when nothing is detected
        if output is None:
            return result

        # --------------------------------------------------------
        # Current RapidOCR API
        # RapidOCROutput exposes:
        #   txts
        #   scores
        #   boxes
        # --------------------------------------------------------
        if hasattr(output, "txts"):

            texts = getattr(output, "txts", None)
            scores = getattr(output, "scores", None)
            boxes = getattr(output, "boxes", None)

            if texts is None:
                texts = []
            if scores is None:
                scores = []

            for i, text in enumerate(texts):

                text = str(text).strip()

                if not text:
                    continue

                confidence = None
                box = None

                if i < len(scores):
                    try:
                        confidence = float(scores[i])
                    except Exception:
                        confidence = None

                if boxes is not None and i < len(boxes):
                    try:
                        box = boxes[i].tolist()
                    except Exception:
                        box = boxes[i]

                result["lines"].append({
                    "text": text,
                    "confidence": confidence,
                    "box": box
                })

        # --------------------------------------------------------
        # Compatibility with older RapidOCR tuple output
        # --------------------------------------------------------
        elif isinstance(output, (tuple, list)):

            if len(output) > 0 and output[0] is not None:

                raw_results = output[0]

                for item in raw_results:

                    try:
                        box = item[0]
                        text = str(item[1]).strip()
                        confidence = float(item[2])

                        if not text:
                            continue

                        try:
                            box = box.tolist()
                        except Exception:
                            pass

                        result["lines"].append({
                            "text": text,
                            "confidence": confidence,
                            "box": box
                        })

                    except Exception:
                        continue

        result["text"] = "\n".join(
            line["text"]
            for line in result["lines"]
            if line.get("text")
        )

    except Exception as e:

        result["available"] = False
        result["error"] = str(e)

    return result


# ============================================================
# PADDLEOCR ENGINE
# ============================================================

def run_paddleocr_engine(image):
    result = {
        "engine": "paddleocr",
        "available": True,
        "text": "",
        "lines": [],
        "error": None
    }

    try:
        if PADDLE_OCR is None:
            result["available"] = False
            result["error"] = "PaddleOCR is not initialized"
            return result

        output = PADDLE_OCR.predict(np.array(image))

        for item in output:
            data = None

            if hasattr(item, "json"):
                data = item.json
                if callable(data):
                    data = data()

            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except Exception:
                    continue

            if not isinstance(data, dict):
                continue

            ocr_data = data.get("res", data)
            if not isinstance(ocr_data, dict):
                continue

            rec_texts = ocr_data.get("rec_texts") or []
            rec_scores = ocr_data.get("rec_scores") or []
            rec_boxes = ocr_data.get("rec_boxes") or []

            for i, text in enumerate(rec_texts):
                text = str(text).strip()
                if not text:
                    continue

                confidence = None
                box = None

                if i < len(rec_scores):
                    try:
                        confidence = float(rec_scores[i])
                    except Exception:
                        confidence = None

                if i < len(rec_boxes):
                    try:
                        box = (
                            rec_boxes[i].tolist()
                            if hasattr(rec_boxes[i], "tolist")
                            else rec_boxes[i]
                        )
                    except Exception:
                        box = None

                result["lines"].append({
                    "text": text,
                    "confidence": confidence,
                    "box": box
                })

        result["text"] = "\n".join(
            line["text"]
            for line in result["lines"]
            if line.get("text")
        )

    except Exception as e:
        result["available"] = False
        result["error"] = str(e)

    return result


# ============================================================
# TESSERACT ENGINE
# ============================================================

def run_tesseract_engine(image):
    result = {
        "engine": "tesseract",
        "available": True,
        "text": "",
        "lines": [],
        "error": None
    }

    try:
        data = pytesseract.image_to_data(
            image,
            config="--psm 6",
            output_type=pytesseract.Output.DICT
        )

        texts = data.get("text", [])
        confidences = data.get("conf", [])
        lefts = data.get("left", [])
        tops = data.get("top", [])
        widths = data.get("width", [])
        heights = data.get("height", [])

        for i, text in enumerate(texts):
            text = str(text).strip()
            if not text:
                continue

            confidence = None
            if i < len(confidences):
                try:
                    raw_confidence = float(confidences[i])
                    if raw_confidence >= 0:
                        confidence = raw_confidence / 100.0
                except Exception:
                    confidence = None

            box = None
            try:
                left = lefts[i]
                top = tops[i]
                width = widths[i]
                height = heights[i]
                box = [
                    [left, top],
                    [left + width, top],
                    [left + width, top + height],
                    [left, top + height]
                ]
            except Exception:
                box = None

            result["lines"].append({
                "text": text,
                "confidence": confidence,
                "box": box
            })

        result["text"] = "\n".join(
            line["text"]
            for line in result["lines"]
            if line.get("text")
        )

    except Exception as e:
        result["available"] = False
        result["error"] = str(e)

    return result


# ============================================================
# MULTI-OCR ENGINE
# ============================================================

def run_multi_ocr(image):
    """Run RapidOCR, PaddleOCR and Tesseract on the same image."""
    return {
        "rapidocr": run_rapidocr_engine(image),
        "paddleocr": run_paddleocr_engine(image),
        "tesseract": run_tesseract_engine(image)
    }
# ============================================================
# OCR CONSENSUS / ENSEMBLE ANALYZER
# ============================================================

import re
from collections import Counter


def normalize_consensus_text(value):
    """
    Normalize OCR text for comparison.

    This is ONLY for comparing OCR outputs.
    It does not replace the original OCR text.
    """

    if value is None:
        return ""

    text = str(value).upper().strip()

    # Normalize common OCR spacing
    text = re.sub(r"\s+", " ", text)

    # Normalize punctuation spacing
    text = re.sub(r"\s*:\s*", ":", text)
    text = re.sub(r"\s*/\s*", "/", text)

    # Common OCR variations
    replacements = {
        "M.R.P.": "MRP",
        "M.R.P": "MRP",
        "NETQUANTITY": "NET QUANTITY",
        "NET QTY": "NET QUANTITY",
        "BATCHNO": "BATCH NO",
        "DATEOF": "DATE OF",
        "PACKING": "PACKING",
        "USEBY": "USE BY",
        "FSAAl": "FSSAI",
        "FSAAL": "FSSAI",
        "FS SAI": "FSSAI",
    }

    for old, new in replacements.items():
        text = text.replace(old, new)

    return text.strip()


def extract_consensus_fields_from_text(text):
    """
    Extract important packaged-commodity fields from
    one OCR engine's complete text.

    This is intentionally conservative.
    Missing information is returned as None.
    """

    if not text:
        return {}

    original = str(text)
    normalized = normalize_consensus_text(original)

    fields = {
        "net_quantity": None,
        "mrp": None,
        "batch_no": None,
        "date_of_packing": None,
        "use_by": None,
        "fssai": None,
        "manufacturer": None,
        "barcode": None,
    }

    # --------------------------------------------------------
    # NET QUANTITY
    # --------------------------------------------------------

    match = re.search(
        r"NET\s*QUANTITY\s*[:\-]?\s*"
        r"([0-9]+(?:\.[0-9]+)?\s*"
        r"(?:ML|L|G|KG))"
        r"(?:\s*\(\s*([0-9]+(?:\.[0-9]+)?\s*(?:G|KG))\s*\))?",
        normalized,
        re.IGNORECASE
    )

    if match:
        value = match.group(1)

        if match.group(2):
            value += f" ({match.group(2)})"

        fields["net_quantity"] = value.upper()

    # --------------------------------------------------------
    # MRP
    # --------------------------------------------------------

    match = re.search(
        r"\bMRP\b\s*[:\-]?\s*"
        r"(?:RS\.?|₹)?\s*"
        r"([0-9]+(?:\.[0-9]{1,2})?)",
        normalized,
        re.IGNORECASE
    )

    if match:
        fields["mrp"] = match.group(1)

    # --------------------------------------------------------
    # BATCH NUMBER
    # --------------------------------------------------------

    match = re.search(
        r"BATCH\s*NO\.?\s*[:\-]?\s*"
        r"([A-Z0-9][A-Z0-9\-\/]*)",
        normalized,
        re.IGNORECASE
    )

    if match:
        fields["batch_no"] = match.group(1).upper()

    # --------------------------------------------------------
    # DATE OF PACKING
    # --------------------------------------------------------

    match = re.search(
        r"DATE\s*OF\s*PACKING\s*[:\-]?\s*"
        r"([0-9]{1,2}\s+"
        r"[A-Z]{3,9}\s+"
        r"[0-9]{4})",
        normalized,
        re.IGNORECASE
    )

    if match:
        fields["date_of_packing"] = match.group(1).upper()

    # --------------------------------------------------------
    # USE BY
    # --------------------------------------------------------

    match = re.search(
        r"USE\s*BY\s*[:\-]?\s*"
        r"([0-9]{1,2}\s+"
        r"[A-Z]{3,9}\s+"
        r"[0-9]{4})",
        normalized,
        re.IGNORECASE
    )

    if match:
        fields["use_by"] = match.group(1).upper()

    # --------------------------------------------------------
    # FSSAI LICENCE NUMBER
    # --------------------------------------------------------

    match = re.search(
        r"(?:LIC\.?\s*NO\.?|LICENSE\s*NO\.?|FSSAI)"
        r"\s*[:\-]?\s*"
        r"([0-9]{14})",
        normalized,
        re.IGNORECASE
    )

    if match:
        fields["fssai"] = match.group(1)

    # Also detect a standalone 14-digit FSSAI number
    if fields["fssai"] is None:

        match = re.search(
            r"\b([0-9]{14})\b",
            normalized
        )

        if match:
            fields["fssai"] = match.group(1)

    # --------------------------------------------------------
    # BARCODE
    # --------------------------------------------------------

    # EAN-13
    match = re.search(
        r"\b([0-9]{13})\b",
        normalized
    )

    if match:
        fields["barcode"] = match.group(1)

    # --------------------------------------------------------
    # MANUFACTURER
    # --------------------------------------------------------

    match = re.search(
        r"MANUFACTURED\s*&?\s*PACKED\s*BY\s*[:\-]?\s*"
        r"(.+)",
        original,
        re.IGNORECASE
    )

    if match:

        manufacturer_line = match.group(1).strip()

        # Take only the first meaningful line
        manufacturer_line = manufacturer_line.split("\n")[0]

        if manufacturer_line:
            fields["manufacturer"] = manufacturer_line.strip()

    # Handle common standalone company line
    if fields["manufacturer"] is None:

        match = re.search(
            r"\b([A-Z][A-Za-z&.\- ]{2,80}"
            r"(?:LTD\.?|LIMITED|PVT\.?\s*LTD\.?|"
            r"PRIVATE\s+LIMITED))\b",
            original,
            re.IGNORECASE
        )

        if match:
            fields["manufacturer"] = (
                match.group(1).strip()
            )

    return fields


def build_field_consensus(engine_results):
    """
    Compare extracted fields from RapidOCR, PaddleOCR
    and Tesseract.

    Consensus rules:

    3/3 agreement:
        CONFIRMED

    2/3 agreement:
        CONSENSUS

    Conflicting non-empty values:
        REVIEW_REQUIRED

    Only one engine detects a value:
        REVIEW_REQUIRED

    No engine detects a value:
        NOT_DETECTED
    """

    engine_fields = {}

    # --------------------------------------------------------
    # Extract fields from each engine
    # --------------------------------------------------------

    for engine_name, engine_result in engine_results.items():

        if not engine_result:
            continue

        if not engine_result.get("available", False):
            continue

        text = engine_result.get("text", "")

        engine_fields[engine_name] = (
            extract_consensus_fields_from_text(text)
        )

    field_names = [
        "net_quantity",
        "mrp",
        "batch_no",
        "date_of_packing",
        "use_by",
        "fssai",
        "manufacturer",
        "barcode",
    ]

    consensus = {}

    # --------------------------------------------------------
    # Compare each field independently
    # --------------------------------------------------------

    for field_name in field_names:

        values_by_engine = {}
        normalized_values = {}

        for engine_name, fields in engine_fields.items():

            value = fields.get(field_name)

            if value is None:
                continue

            value = str(value).strip()

            if not value:
                continue

            values_by_engine[engine_name] = value

            comparison_value = normalize_consensus_text(value)

            normalized_values.setdefault(
                comparison_value,
                []
            ).append(engine_name)

        # Nothing detected
        if not normalized_values:

            consensus[field_name] = {
                "value": None,
                "status": "NOT_DETECTED",
                "agreement": 0,
                "total_engines": len(engine_fields),
                "engines": {},
                "alternatives": []
            }

            continue

        # Find strongest agreement
        groups = sorted(
            normalized_values.items(),
            key=lambda item: len(item[1]),
            reverse=True
        )

        winning_normalized_value = groups[0][0]
        winning_engines = groups[0][1]

        winning_original_value = None

        for engine_name in winning_engines:

            if engine_name in values_by_engine:

                winning_original_value = (
                    values_by_engine[engine_name]
                )

                break

        agreement = len(winning_engines)
        total_engines = len(engine_fields)

        # ----------------------------------------------------
        # Status
        # ----------------------------------------------------

        if len(groups) == 1:

            if agreement >= 3:
                status = "CONFIRMED"

            elif agreement == 2:
                status = "CONSENSUS"

            else:
                status = "REVIEW_REQUIRED"

        else:

            # There are conflicting values
            status = "REVIEW_REQUIRED"

        # ----------------------------------------------------
        # Alternatives
        # ----------------------------------------------------

        alternatives = []

        for normalized_value, engines in groups[1:]:

            original_value = None

            for engine_name in engines:

                original_value = values_by_engine.get(
                    engine_name
                )

                if original_value:
                    break

            alternatives.append({
                "value": original_value,
                "engines": engines,
                "agreement": len(engines)
            })

        consensus[field_name] = {
            "value": winning_original_value,
            "status": status,
            "agreement": agreement,
            "total_engines": total_engines,
            "engines": values_by_engine,
            "alternatives": alternatives
        }

    return {
        "engines": engine_fields,
        "fields": consensus
    }


def run_multi_ocr_with_consensus(image):
    """
    Complete OCR ensemble operation.

    1. Run all OCR engines.
    2. Extract fields independently.
    3. Compare field values.
    4. Return OCR + consensus information.
    """

    engine_results = run_multi_ocr(image)

    consensus = build_field_consensus(
        engine_results
    )

    return {
        "ocr_results": engine_results,
        "consensus": consensus
    }


# ============================================================
# END OCR CONSENSUS / ENSEMBLE ANALYZER
# ============================================================


# ============================================================
# END MULTI-OCR ENGINE LAYER
# ============================================================
# ============================================================
# OCR
# ============================================================

def run_ocr(image):
    """
    Orientation-aware OCR strategy.

    1. Try the original orientation with original + enhanced images.
    2. If the OCR result is weak, try 90 and 270 degree rotations.
    3. Also try 180 degrees as a final fallback.

    This is intentionally conditional so normal scans stay reasonably fast.
    """

    def deduplicate(values):
        result = []
        seen = set()

        for line in values:
            line = clean_spaces(line)
            if not line:
                continue

            key = re.sub(
                r"[^A-Z0-9]+",
                "",
                line.upper()
            )

            if not key or key in seen:
                continue

            seen.add(key)
            result.append(line)

        return result

    def collect_for_image(target_image, full_variants=True):
        collected = []

        variants = preprocess_variants(target_image)

        if not full_variants:
            variants = variants[:1]

        for variant in variants:
            collected.extend(ocr_once(variant))

        return collected

    def strength(lines):
        meaningful = [
            line for line in lines
            if len(re.sub(r"[^A-Za-z0-9]", "", line)) >= 3
        ]

        joined = " ".join(meaningful).upper()

        anchors = [
            "MRP", "NET", "WEIGHT", "BATCH", "PKD",
            "MFD", "MFG", "PACKED", "USE BY", "BEST BEFORE", "FSSAI",
            "AMUL", "MILK", "BUTTER", "PANEER", "LIC", "MARKETED"
        ]

        anchor_hits = sum(1 for anchor in anchors if anchor in joined)

        return len(meaningful) + (anchor_hits * 3)

    candidates = []

    # Normal orientation: OCR the complete image AND the major
    # left/right label panels separately. Composite test images
    # often contain the front pack on one side and the declaration
    # panel on the other; full-image OCR can otherwise focus only
    # on the dense declaration panel and miss the product name.
    normal_values = collect_for_image(
        image,
        full_variants=True
    )

    try:
        width, height = image.size

        # Left panel: typically the front of a side-by-side
        # front/back product-label test image.
        if width >= 2:
            left_panel = image.crop(
                (0, 0, width // 2, height)
            )
            normal_values.extend(
                collect_for_image(
                    left_panel,
                    full_variants=True
                )
            )

        # Right panel is retained because some products have
        # the front panel on the right side.
        if width >= 2:
            right_panel = image.crop(
                (width // 2, 0, width, height)
            )
            normal_values.extend(
                collect_for_image(
                    right_panel,
                    full_variants=True
                )
            )

    except Exception as error:
        print("Panel OCR error:", error)

    normal = deduplicate(normal_values)
    candidates.append(("0", normal))

    # If weak, test all quarter-turn orientations. This fixes
    # mobile photos where the whole label is sideways.
    if strength(normal) < 18:
        for angle in (90, 270, 180):
            try:
                rotated = image.rotate(angle, expand=True)
                lines = deduplicate(
                    collect_for_image(rotated, full_variants=False)
                )
                candidates.append((str(angle), lines))
            except Exception as error:
                print(f"OCR rotation {angle} error:", error)

    best_orientation, best_lines = max(
        candidates,
        key=lambda item: strength(item[1])
    )

    print(
        "OCR orientation selected:",
        best_orientation,
        "score:",
        strength(best_lines)
    )

    return "\n".join(best_lines)


# ============================================================
# OCR NORMALIZATION
# ============================================================

def normalize_text(text):

    if not text:
        return ""

    text = str(text)

    replacements = {

        "\r\n": "\n",
        "\r": "\n",

        "NETQTY": "NET QTY",
        "NETWT": "NET WEIGHT",
        "NET WT": "NET WEIGHT",

        "BATCHNO": "BATCH NO",
        "BATCH.NO": "BATCH NO",
        "BATCH NO.": "BATCH NO",

        "LOTNO": "LOT NO",
        "LOT.NO": "LOT NO",
        "LOT NO.": "LOT NO",

        "LIC.NO": "LIC NO",
        "LIC. NO": "LIC NO",

        "FSAAl": "FSSAI",
        "FSAAL": "FSSAI",
        "FS SAI": "FSSAI",

        "PKD.": "PKD",
        "MFD.": "MFD",
        "MFG.": "MFG",
        "EXP.": "EXP",

        "USE BY:": "USE BY",
        "BEST BEFORE:": "BEST BEFORE",

        "M.R.P.": "MRP",
        "M.R.P": "MRP",
        "M P": "MRP",

        # Common OCR substitutions on dairy packets.
        "AMUI": "AMUL",
        "AMULI": "AMUL",
        "PKO": "PKD",
        "PXD": "PKD",
        "MFO": "MFD",
        "M.F.D.": "MFD",
        "M.F.D": "MFD",
        "M.F.G.": "MFG",
        "M.F.G": "MFG",
    }

    for old, new in replacements.items():

        text = text.replace(
            old,
            new
        )

    return text


# ============================================================
# TEXT VIEWS
# ============================================================

def text_lines(text):
    return unique_preserve(
        [
            clean_line(line)
            for line in str(text).splitlines()
        ]
    )


def compact_text(text):
    return clean_spaces(
        str(text).replace(
            "\n",
            " "
        )
    )


# ============================================================
# DATE UTILITIES
# ============================================================

# Full date formats commonly found on packaged commodities.
# IMPORTANT: include both numeric dates and day-month-year dates such as
# "12 FEB 2024" and "11 AUG 2025".
DATE_RE = re.compile(
    r"\b("
    r"[0-9]{4}[\/\-][0-9]{1,2}[\/\-][0-9]{1,2}"
    r"|[0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4}"
    r"|[0-9]{1,2}\s+"
    r"(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|"
    r"JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|"
    r"OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)"
    r"\s+[0-9]{2,4}"
    r"|(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|"
    r"JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|"
    r"OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)"
    r"\s+[0-9]{1,2},?\s+[0-9]{2,4}"
    r")\b",
    re.IGNORECASE
)

# Month/year fallback for declarations that intentionally contain only
# a month and year, e.g. "AUG 2025" or "08/2025".
MONTH_YEAR_RE = re.compile(
    r"\b(?:"
    r"[0-9]{1,2}[\/\-.][0-9]{2,4}|"
    r"(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|"
    r"MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:T(?:EMBER)?)?|"
    r"OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)"
    r"[\s\-/,]+[0-9]{2,4}"
    r")\b",
    re.IGNORECASE
)


def normalize_date(value):
    value = re.sub(r"\s+", " ", str(value).strip())
    value = value.replace(".", "/").replace("-", "/")
    return value


def date_matches(text):
    matches = []
    seen = set()

    # Full dates have priority. Do not let the month/year regex
    # return a shorter substring such as 12/08 from 12/08/26.
    full_spans = []
    for match in DATE_RE.finditer(text):
        value = normalize_date(match.group(1))
        key = value.upper()
        if key not in seen:
            seen.add(key)
            matches.append({
                "value": value,
                "start": match.start(),
                "end": match.end()
            })
        full_spans.append((match.start(), match.end()))

    for match in MONTH_YEAR_RE.finditer(text):
        if any(
            match.start() < end and match.end() > start
            for start, end in full_spans
        ):
            continue
        value = normalize_date(match.group(0))
        key = value.upper()
        if key in seen:
            continue
        seen.add(key)
        matches.append({
            "value": value,
            "start": match.start(),
            "end": match.end()
        })

    matches.sort(key=lambda item: item["start"])
    return matches


def extract_all_dates(text):
    return date_matches(text)


def _date_from_fragment(fragment):
    dates = date_matches(fragment)
    if dates:
        return dates[-1]["value"]

    # Many packaged commodities print only month/year for the
    # manufacturing or packing declaration, e.g. MFD 08/2026 or
    # MFG: AUG 2026.
    match = MONTH_YEAR_RE.search(str(fragment))
    if match:
        return normalize_date(match.group(0))

    return None


def extract_date_after_label(text, labels):
    """Associate a declaration label with the nearest complete date.

    OCR frequently puts the label and date on separate lines.  Search a
    small local block first and prefer a complete day-month-year date over
    a month/year fallback.
    """

    lines = text_lines(text)

    declaration_labels = [
        "PKD", "MFD", "MFG", "PACKED", "PACKED ON",
        "MANUFACTURED", "USE BY", "BEST BEFORE", "EXP", "EXPIRY"
    ]

    for index, line in enumerate(lines):

        for label in labels:

            match = re.search(label, line, re.IGNORECASE)

            if not match:
                continue

            # Search same line + next three OCR lines as one block.
            # This handles: USE BY -> 11 AUG 2025 and similar layouts.
            block_lines = lines[index:index + 4]
            combined = clean_spaces(" ".join(block_lines))

            # Prefer a complete date.
            dates = date_matches(combined)
            if dates:
                return found(dates[0]["value"])

            # If the first few lines contain another declaration label,
            # don't wander into the next declaration.
            for offset, candidate in enumerate(block_lines[1:], start=1):
                if any(
                    re.search(
                        r"\b" + re.escape(other) + r"\b",
                        candidate,
                        re.IGNORECASE
                    )
                    for other in declaration_labels
                ):
                    block_lines = block_lines[:offset]
                    break

            combined = clean_spaces(" ".join(block_lines))
            dates = date_matches(combined)
            if dates:
                return found(dates[0]["value"])

            # Only after complete-date search fails, allow month/year.
            partial = _date_from_fragment(combined)
            if partial:
                return found(partial)

    # Final compact fallback for OCR that removed line boundaries.
    compact = compact_text(text)

    for label in labels:

        match = re.search(
            label + r".{0,80}?",
            compact,
            re.IGNORECASE
        )

        if not match:
            continue

        fragment = compact[match.start():match.end() + 80]
        dates = date_matches(fragment)

        if dates:
            return found(dates[0]["value"])

        partial = _date_from_fragment(fragment)
        if partial:
            return found(partial)

    return not_found()


def extract_mfd(text):
    return extract_date_after_label(
        text,
        [
            r"\bPKD\b", r"\bMFD\b", r"\bMFG\b",
            r"\bMFD\s*DATE\b", r"\bMFG\s*DATE\b",
            r"\bPACKED\s*ON\b", r"\bPACKED\b",
            r"\bMANUFACTURED\s*(?:ON|DATE)?\b",
            r"\bDATE\s*OF\s*(?:MFG|MFD|MFG\.?|MFD\.?|MANUFACTURE|MANUFACTURING|PACKING)\b"
        ]
    )


def extract_expiry(text):
    return extract_date_after_label(
        text,
        [
            r"\bUSE\s*BY\b", r"\bBEST\s*BEFORE\b",
            r"\bEXPIRY\b", r"\bEXP\b",
            r"\bDATE\s*OF\s*EXPIRY\b"
        ]
    )


# ============================================================
# QUANTITY
# ============================================================

QUANTITY_PATTERN = (
    r"([0-9]+(?:\.[0-9]+)?)\s*"
    r"(KG|KGS|G|GM|GMS|GRAM|GRAMS|"
    r"MG|MGS|MILLIGRAM|MILLIGRAMS|"
    r"ML|MLS|MILLILITRE|MILLILITRES|"
    r"L|LTR|LITRE|LITRES)"
)


def format_quantity(number, unit):

    unit = re.sub(r"\s+", "", unit.upper())

    if unit in ["GM", "GMS", "GRAM", "GRAMS"]:
        unit = "G"
    elif unit in ["MG", "MGS", "MILLIGRAM", "MILLIGRAMS"]:
        unit = "MG"
    elif unit == "KGS":
        unit = "KG"
    elif unit in ["MLS", "MILLILITRE", "MILLILITRES"]:
        unit = "ML"
    elif unit in ["LTR", "LITRE", "LITRES"]:
        unit = "L"

    return f"{number}{unit}"


def extract_quantity(text):

    """
    Extract the complete declared net quantity.

    Examples:
        NET QUANTITY : 1 L
        NET QUANTITY : 1 L (910 g)
        NET WT : 500 g
        NET WEIGHT : 1 kg

    Preserves parenthetical equivalent quantity when present.
    """

    normalized = re.sub(
        r"\bNET\s*(?:QTY|QUANTITY|WEIGHT|WT)\s*[.:=\-]?",
        "NET QUANTITY ",
        str(text),
        flags=re.IGNORECASE
    )

    # ---------------------------------------------------------
    # 1. Main quantity + optional parenthetical quantity
    # ---------------------------------------------------------

    quantity_pattern = (
        r"([0-9]+(?:\.[0-9]+)?)\s*"
        r"(KG|KGS|G|GM|GMS|GRAM|GRAMS|"
        r"MG|MGS|MILLIGRAM|MILLIGRAMS|"
        r"ML|MLS|MILLILITRE|MILLILITRES|"
        r"L|LTR|LITRE|LITRES)"
    )

    patterns = [

        r"\bNET\s*QUANTITY\b.{0,100}?"
        + quantity_pattern
        + r"\s*"
        + r"(?:\(\s*"
        + quantity_pattern
        + r"\s*\))?",

        r"\bNET\s*WEIGHT\b.{0,100}?"
        + quantity_pattern
        + r"\s*"
        + r"(?:\(\s*"
        + quantity_pattern
        + r"\s*\))?",

        r"\bNET\s*QTY\b.{0,100}?"
        + quantity_pattern
        + r"\s*"
        + r"(?:\(\s*"
        + quantity_pattern
        + r"\s*\))?",
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            normalized,
            re.IGNORECASE | re.DOTALL
        )

        if match:

            groups = match.groups()

            # Because the same quantity pattern is repeated,
            # groups are:
            #
            # 1,2 = main quantity
            # 3,4 = parenthetical quantity

            main_number = groups[0]
            main_unit = groups[1]

            main_value = format_quantity(
                main_number,
                main_unit
            )

            # Parenthetical equivalent quantity exists.
            if len(groups) >= 4 and groups[2] and groups[3]:

                secondary_value = format_quantity(
                    groups[2],
                    groups[3]
                )

                return found(
                    f"{main_value} ({secondary_value.lower()})"
                )

            return found(
                main_value
            )

    # ---------------------------------------------------------
    # 2. Fallback for OCR where declaration and value are
    #    separated across lines.
    # ---------------------------------------------------------

    lines = text_lines(normalized)

    for index, line in enumerate(lines):

        upper = line.upper()

        if not any(
            token in upper
            for token in (
                "NET",
                "WEIGHT",
                "QTY",
                "QUANTITY",
                "TWEIGHT"
            )
        ):
            continue

        nearby = " ".join(
            lines[index:index + 4]
        )

        match = re.search(
            quantity_pattern
            + r"\s*"
            + r"(?:\(\s*"
            + quantity_pattern
            + r"\s*\))?",
            nearby,
            re.IGNORECASE
        )

        if match:

            groups = match.groups()

            main_value = format_quantity(
                groups[0],
                groups[1]
            )

            if len(groups) >= 4 and groups[2] and groups[3]:

                secondary_value = format_quantity(
                    groups[2],
                    groups[3]
                )

                return found(
                    f"{main_value} ({secondary_value.lower()})"
                )

            return found(
                main_value
            )

    # ---------------------------------------------------------
    # 3. Last-resort declaration-aware scan
    # ---------------------------------------------------------

    for line in lines:

        upper = line.upper()

        if not any(
            token in upper
            for token in (
                "NET",
                "WEIGHT",
                "QTY",
                "QUANTITY"
            )
        ):
            continue

        match = re.search(
            quantity_pattern,
            line,
            re.IGNORECASE
        )

        if match:

            return found(
                format_quantity(
                    match.group(1),
                    match.group(2)
                )
            )

    return not_found()


# ============================================================
# BATCH / LOT
# ============================================================

BATCH_FORBIDDEN_WORDS = [
    "BATCH",
    "BATCH NO",
    "LOT",
    "LOT NO",
    "MRP",
    "PKD",
    "MFD",
    "MFG",
    "USE BY",
    "BEST BEFORE",
    "EXP",
    "EXPIRY",
    "NET",
    "WEIGHT",
    "TWEIGHT",
    "T WEIGHT",
    "FSSAI",
    "LIC",
    "LICENSE",
    "LICENCE",
    "STORE",
    "DRY PLACE",
    "QUALITY",
    "GUARANTEED"
]


def clean_batch_candidate(value):

    value = clean_spaces(
        value
    )

    value = value.strip(
        ":;,.|-"
    )

    # Remove common OCR label prefixes.

    value = re.sub(
        r"^(?:BATCH|BATCH\s*NO|LOT|LOT\s*NO)\s*[:.\-]?\s*",
        "",
        value,
        flags=re.IGNORECASE
    )

    value = clean_spaces(
        value
    )

    return value


def valid_batch_candidate(value):

    if not value:
        return False

    value = clean_batch_candidate(
        value
    )

    upper = value.upper()

    # --------------------------------------------------------
    # Never accept declaration labels as batch numbers.
    # --------------------------------------------------------

    for word in BATCH_FORBIDDEN_WORDS:

        if word in upper:
            return False

    # --------------------------------------------------------
    # Never accept a quantity as a batch.
    # --------------------------------------------------------

    if re.search(
        QUANTITY_PATTERN,
        value,
        re.IGNORECASE
    ):
        return False

    # --------------------------------------------------------
    # No dates.
    # --------------------------------------------------------

    if DATE_RE.search(value):
        return False

    # --------------------------------------------------------
    # Batch values are normally compact.
    # --------------------------------------------------------

    if len(value) < 3:
        return False

    if len(value) > 20:
        return False

    # --------------------------------------------------------
    # Only letters, digits, slash, hyphen, underscore.
    # --------------------------------------------------------

    if not re.fullmatch(
        r"[A-Za-z0-9][A-Za-z0-9_\-/]{2,19}",
        value
    ):
        return False

    # --------------------------------------------------------
    # Require at least one digit.
    #
    # This rejects random OCR words.
    # --------------------------------------------------------

    if not re.search(
        r"\d",
        value
    ):
        return False

    # --------------------------------------------------------
    # Reject pure number strings because they are often
    # prices, quantities, dates or license numbers.
    # --------------------------------------------------------

    if value.isdigit():
        return False

    return True


def extract_batch(text):

    lines = text_lines(
        text
    )

    # --------------------------------------------------------
    # 1. Label-aware extraction.
    #
    # Example:
    #
    # LOT No.
    # B07269J
    #
    # or
    #
    # BATCH NO. B07269J
    # --------------------------------------------------------

    for index, line in enumerate(lines):

        upper = line.upper()

        if (
            "BATCH" not in upper
            and
            "LOT" not in upper
        ):
            continue

        # Same line after label.

        candidate = re.sub(
            r"^.*?(?:BATCH\s*NO|BATCH|LOT\s*NO|LOT)"
            r"\s*[:.\-]?\s*",
            "",
            line,
            flags=re.IGNORECASE
        )

        candidate = clean_batch_candidate(
            candidate
        )

        if valid_batch_candidate(
            candidate
        ):
            return found(
                candidate
            )

        # ----------------------------------------------------
        # Check following OCR lines.
        # ----------------------------------------------------

        for offset in [1, 2]:

            next_index = index + offset

            if next_index >= len(lines):
                break

            candidate = clean_batch_candidate(
                lines[next_index]
            )

            if valid_batch_candidate(
                candidate
            ):
                return found(
                    candidate
                )

            # If the next line contains another declaration
            # label, don't search farther.
            next_upper = lines[
                next_index
            ].upper()

            if any(
                word in next_upper
                for word in [
                    "MRP",
                    "PKD",
                    "MFD",
                    "USE BY",
                    "NET WEIGHT"
                ]
            ):
                break

    # --------------------------------------------------------
    # 2. Global fallback.
    #
    # Only accept strongly batch-like tokens.
    # --------------------------------------------------------

    candidates = re.findall(
        r"\b[A-Z]{1,4}[0-9][A-Z0-9\-/]{2,15}\b",
        text.upper()
    )

    for candidate in candidates:

        if valid_batch_candidate(
            candidate
        ):
            return found(
                candidate
            )

    return not_found()


# ============================================================
# MRP
# ============================================================

def extract_mrp(text):

    candidates = []

    # --------------------------------------------------------
    # Label-based MRP extraction.
    # --------------------------------------------------------

    patterns = [

        r"\bMRP\b"
        r"\s*[:.]?\s*"
        r"(?:RS\.?|INR|₹)?"
        r"\s*"
        r"([0-9]+(?:\.[0-9]{1,2})?)",

        r"\bMRP\s*RS\.?\s*"
        r"([0-9]+(?:\.[0-9]{1,2})?)",

        r"\bMRP\s*₹\s*"
        r"([0-9]+(?:\.[0-9]{1,2})?)",
    ]

    for pattern in patterns:

        for match in re.finditer(
            pattern,
            text,
            re.IGNORECASE
        ):

            try:

                value = float(
                    match.group(1)
                )

                candidates.append(
                    value
                )

            except Exception:
                pass

    # --------------------------------------------------------
    # Prefer the most complete MRP value.
    #
    # This prevents:
    #
    # MRP Rs.10.00
    #
    # from becoming:
    #
    # ₹1
    # --------------------------------------------------------

    if candidates:

        # Keep sensible positive prices.

        candidates = [
            value
            for value in candidates
            if value > 0
        ]

        if candidates:

            # If there are duplicates, use the largest
            # complete value.
            value = max(
                candidates
            )

            if value.is_integer():
                formatted = str(
                    int(value)
                )
            else:
                formatted = (
                    f"{value:.2f}"
                    .rstrip("0")
                    .rstrip(".")
                )

            return found(
                f"₹{formatted}"
            )

    # --------------------------------------------------------
    # Fallback: common OCR error ARP -> MRP.
    # Only accept when followed by a price.
    # --------------------------------------------------------

    pattern = (
        r"\bARP\b"
        r"\s*[:.]?\s*"
        r"(?:RS\.?|INR|₹)?"
        r"\s*"
        r"([0-9]+(?:\.[0-9]{1,2})?)"
    )

    match = re.search(
        pattern,
        text,
        re.IGNORECASE
    )

    if match:

        try:

            value = float(
                match.group(1)
            )

            if value > 0:

                if value.is_integer():
                    formatted = str(
                        int(value)
                    )
                else:
                    formatted = (
                        f"{value:.2f}"
                        .rstrip("0")
                        .rstrip(".")
                    )

                return found(
                    f"₹{formatted}"
                )

        except Exception:
            pass

    return not_found()


# ============================================================
# FSSAI / LICENSE
# ============================================================

def extract_fssai(text):

    patterns = [

        r"(?:FSSAI|LIC\s*NO|LICENSE\s*NO|LICENCE\s*NO)"
        r"\s*[:.]?\s*"
        r"([0-9]{10,15})",

        r"\b([0-9]{14})\b"
    ]

    # Prefer values directly associated with FSSAI/license.

    for pattern in patterns[:-1]:

        match = re.search(
            pattern,
            text,
            re.IGNORECASE
        )

        if match:

            value = match.group(1)

            return found(
                value
            )

    # FSSAI license numbers in India are commonly 14 digits.

    candidates = re.findall(
        r"\b[0-9]{14}\b",
        text
    )

    if candidates:

        return found(
            candidates[0]
        )

    return not_found()


# ============================================================
# CUSTOMER CARE
# ============================================================

def extract_customer_care(text):

    # ========================================================
    # CUSTOMER CARE / CONSUMER CARE
    # ========================================================
    # Do NOT search the entire OCR text for arbitrary 10-digit
    # numbers. Product barcodes such as 8901262240018 must not
    # be interpreted as phone numbers.

    # --------------------------------------------------------
    # 1. Email address
    # --------------------------------------------------------
    email = re.search(
        r"\b[A-Z0-9._%+\-]+"
        r"@[A-Z0-9.\-]+\.[A-Z]{2,}\b",
        text,
        re.IGNORECASE
    )

    if email:
        return found(email.group(0))

    # --------------------------------------------------------
    # 2. Phone number explicitly associated with customer care
    # --------------------------------------------------------
    labeled_phone = re.search(
        r"(?:"
        r"CUSTOMER\s*CARE"
        r"|CONSUMER\s*CARE"
        r"|CUSTOMER\s*SERVICE"
        r"|CONSUMER\s*SERVICE"
        r"|TOLL\s*FREE"
        r"|HELPLINE"
        r"|HELP\s*LINE"
        r"|CONTACT\s*US"
        r"|CONTACT"
        r")"
        r"\s*"
        r"(?:NO\.?|NUMBER|PHONE|TEL|TELEPHONE)?"
        r"\s*[:\-]?\s*"
        r"((?:\+91[\s\-]?)?[6-9][0-9]{9})",
        text,
        re.IGNORECASE
    )

    if labeled_phone:
        return found(labeled_phone.group(1))

    # --------------------------------------------------------
    # 3. Common formatted toll-free / helpline number
    # --------------------------------------------------------
    labeled_helpline = re.search(
        r"(?:"
        r"TOLL\s*FREE"
        r"|HELPLINE"
        r"|HELP\s*LINE"
        r"|CUSTOMER\s*CARE"
        r"|CONSUMER\s*CARE"
        r"|CUSTOMER\s*SERVICE"
        r"|CONSUMER\s*SERVICE"
        r")"
        r"\s*[:\-]?\s*"
        r"([0-9]{3,5}(?:[\s\-][0-9]{2,5}){1,3})",
        text,
        re.IGNORECASE
    )

    if labeled_helpline:
        return found(labeled_helpline.group(1).strip())

    # --------------------------------------------------------
    # 4. No reliable customer-care information found
    # --------------------------------------------------------
    return not_found()


# ============================================================
# MANUFACTURER / MARKETER
# ============================================================

KNOWN_COMPANIES = [
    "ITC LIMITED",
    "BRITANNIA INDUSTRIES LTD",
    "BRITANNIA INDUSTRIES LIMITED",
    "HINDUSTAN UNILEVER LIMITED",
    "HINDUSTAN UNILEVER",
    "NESTLE INDIA LIMITED",
    "NESTLE INDIA",
    "PARLE PRODUCTS PRIVATE LIMITED",
    "PARLE PRODUCTS",
    "DABUR INDIA LIMITED",
    "DABUR INDIA",
    "PATANJALI AYURVED LIMITED",
    "PATANJALI AYURVED",
    "MARICO LIMITED",
    "MARICO",
    "PROCTER & GAMBLE",
    "PROCTER AND GAMBLE",
    "COCA-COLA",
    "PEPSICO INDIA",
    "AMUL",
    "MOTHER DAIRY",
]


def extract_manufacturer(text):

    upper_text = text.upper()

    # --------------------------------------------------------
    # Known-company recognition.
    #
    # This is safer than blindly taking the line after
    # "MARKETED BY".
    # --------------------------------------------------------

    for company in KNOWN_COMPANIES:

        if company in upper_text:

            return found(
                company
            )

    lines = text_lines(
        text
    )

    labels = [
        "MANUFACTURED BY",
        "MANUFACTURER",
        "MARKETED BY",
        "PACKED BY",
        "IMPORTED BY",
        "MFD BY",
    ]

    for index, line in enumerate(lines):

        upper = line.upper()

        matched = False

        for label in labels:

            if label in upper:

                matched = True

                # ------------------------------------------------
                # Text after label on same line.
                # ------------------------------------------------

                candidate = re.sub(
                    r"^.*?" +
                    re.escape(label) +
                    r"\s*[:.\-]?\s*",
                    "",
                    line,
                    flags=re.IGNORECASE
                )

                candidate = clean_line(
                    candidate
                )

                if candidate:

                    # Avoid obvious unrelated OCR.
                    if (
                        len(candidate) <= 100
                        and
                        "STORE IN A COOL" not in candidate.upper()
                    ):

                        return found(
                            candidate
                        )

                # ------------------------------------------------
                # Next line.
                # ------------------------------------------------

                if index + 1 < len(lines):

                    candidate = clean_line(
                        lines[index + 1]
                    )

                    if (
                        candidate
                        and
                        len(candidate) <= 100
                        and
                        "STORE IN A COOL" not in candidate.upper()
                    ):

                        return found(
                            candidate
                        )

                break

        if matched:
            continue

    return not_found()


# ============================================================
# ADDRESS
# ============================================================

def looks_like_address(line):

    upper = line.upper()

    address_words = [
        "ROAD",
        "RD",
        "STREET",
        "ST",
        "LANE",
        "NAGAR",
        "BENGALURU",
        "BANGALORE",
        "HYDERABAD",
        "MUMBAI",
        "DELHI",
        "CHENNAI",
        "KOLKATA",
        "PUNE",
        "INDIA",
        "PIN",
        "FLOOR",
        "CENTRE",
        "CENTER",
        "BUILDING",
        "NO."
    ]

    return (
        any(
            word in upper
            for word in address_words
        )
        and
        (
            bool(
                re.search(
                    r"\b[0-9]{6}\b",
                    line
                )
            )
            or
            len(line) > 25
        )
    )


def extract_address(text):
    """Extract the complete manufacturer/packer address.

    Packaged-product OCR often separates the company, street/locality and
    city/pincode into several lines.  Prefer the address block immediately
    following a manufacturer/packer declaration or known company.
    """

    lines = [clean_line(line) for line in text_lines(text) if clean_line(line)]
    upper_text = text.upper()

    def is_address_piece(line):
        upper = line.upper()
        if not line:
            return False

        strong_words = [
            "FORTUNE HOUSE", "HOUSE", "NEAR ", "NAVRANGPURA",
            "ROAD", " RD", "STREET", " LANE", "NAGAR",
            "BUILDING", "FLOOR", "CENTRE", "CENTER",
            "AHMEDABAD", "BENGALURU", "BANGALORE", "HYDERABAD",
            "MUMBAI", "DELHI", "CHENNAI", "KOLKATA", "PUNE",
            "GUJARAT", "INDIA", "PIN", "P.O.", "POST OFFICE"
        ]
        if any(word in upper for word in strong_words):
            return True

        if re.search(r"\b\d{6}\b", line):
            return True

        return False

    # ---------------------------------------------------------
    # 1. Address immediately after a manufacturer/packer line.
    # ---------------------------------------------------------
    declaration_patterns = [
        r"MANUFACTURED\s*&?\s*PACKED\s+BY",
        r"MANUFACTURED\s+BY",
        r"PACKED\s+BY",
        r"MARKETED\s+BY",
        r"IMPORTED\s+BY",
        r"MFD\s+BY"
    ]

    for index, line in enumerate(lines):

        if not any(re.search(pattern, line, re.IGNORECASE) for pattern in declaration_patterns):
            continue

        # Look through the next several OCR lines.  Do not require the
        # address lines to be immediately adjacent because product text
        # can be interleaved by OCR.
        block = []
        for candidate in lines[index + 1:index + 8]:
            if re.search(
                r"\b(?:FSSAI|LIC\.?\s*NO|NET\s*(?:QTY|QUANTITY|WEIGHT)|MRP|BATCH|USE\s*BY|BEST\s*BEFORE|EXPIRY|TOLL\s*FREE|EMAIL|FOR\s+CONSUMER)",
                candidate,
                re.IGNORECASE
            ):
                break

            if is_address_piece(candidate):
                block.append(candidate)

        if block:
            # Remove obvious product-only fragments that OCR may place
            # inside the manufacturer block.
            block = [
                item for item in block
                if item.upper() not in {
                    "SUNLITE", "REFINED", "SUNFLOWER OIL",
                    "FORTUNE", "PURE &", "FRESH"
                }
            ]

            if block:
                return found(clean_spaces(" ".join(block))[:500])

    # ---------------------------------------------------------
    # 2. Known company anchor fallback.
    # ---------------------------------------------------------
    company_anchors = [
        "ADANI WILMAR LTD",
        "ADANI WILMAR LIMITED"
    ]

    for index, line in enumerate(lines):
        if not any(anchor in line.upper() for anchor in company_anchors):
            continue

        block = []
        for candidate in lines[index + 1:index + 7]:
            if re.search(
                r"\b(?:FSSAI|LIC\.?\s*NO|NET\s*(?:QTY|QUANTITY|WEIGHT)|MRP|BATCH|USE\s*BY|BEST\s*BEFORE|EXPIRY|TOLL\s*FREE|EMAIL|FOR\s+CONSUMER)",
                candidate,
                re.IGNORECASE
            ):
                break

            if is_address_piece(candidate):
                block.append(candidate)

        if block:
            block = [
                item for item in block
                if item.upper() not in {
                    "SUNLITE", "REFINED", "SUNFLOWER OIL",
                    "FORTUNE", "PURE &", "FRESH"
                }
            ]
            if block:
                return found(clean_spaces(" ".join(block))[:500])

    # ---------------------------------------------------------
    # 3. Generic address fallback.
    # ---------------------------------------------------------
    candidates = [line for line in lines if is_address_piece(line)]

    if candidates:
        # Prefer the candidate containing the pincode; if several do,
        # prefer the longest one.
        postal = [line for line in candidates if re.search(r"\b\d{6}\b", line)]
        candidate = max(postal or candidates, key=len)
        return found(candidate[:500])

    return not_found()


# ============================================================
# PRODUCT NAME
# ============================================================

def _product_name_candidate_score(value):
    """Conservative product-name scoring.

    IMPORTANT: METRIYA must never invent a product name from random OCR text.
    A candidate needs real product evidence such as an explicit product label,
    a commodity/category term, or strong front-of-pack wording.
    """
    value = clean_line(value)
    if not value or not (3 <= len(value) <= 100):
        return -10000

    upper = value.upper()
    words = [w.strip(".,:;|()[]{}\"'®™") for w in value.split()]

    forbidden = {
        "MRP", "BATCH", "PKD", "MFD", "MFG", "FSSAI", "LIC", "LICENSE",
        "LICENCE", "EXPIRY", "USE BY", "BEST BEFORE", "NET WEIGHT",
        "NET QUANTITY", "MANUFACTURED", "MANUFACTURER", "PACKED BY",
        "MARKETED BY", "INGREDIENT", "INGREDIENTS", "NUTRITION",
        "CUSTOMER CARE", "CONSUMER CARE", "TOLL FREE", "ADDRESS",
        "STORE IN", "KEEP IN", "FOR CONSUMER", "INCLUSIVE OF ALL TAXES"
    }

    if any(token in upper for token in forbidden):
        return -10000
    if "@" in value or re.search(r"\b(?:HTTP|HTTPS|WWW)\b", upper):
        return -10000
    if re.search(r"\b\d{6}\b", value):
        return -10000

    letters = len(re.findall(r"[A-Za-z]", value))
    digits = len(re.findall(r"\d", value))
    if letters < 4 or digits > 2:
        return -10000

    category_words = {
        "MILK", "COOKIE", "COOKIES", "BISCUIT", "BISCUITS", "OIL",
        "RICE", "FLOUR", "ATTA", "SALT", "SUGAR", "TEA", "COFFEE",
        "CHOCOLATE", "WAFER", "WAFERS", "NOODLES", "PASTA", "SPICE",
        "SPICES", "MASALA", "JUICE", "DRINK", "BEVERAGE", "WATER",
        "SHAMPOO", "SOAP", "DETERGENT", "TOOTHPASTE", "CREAM", "LOTION",
        "BUTTER", "CHEESE", "PANEER", "GHEE", "SNACK", "SNACKS",
        "NAMKEEN", "BREAD", "CAKE", "CEREAL", "POHA", "DAL", "BESAN",
        "SEMOLINA", "VERMICELLI", "SAUCE", "KETCHUP", "JAM", "HONEY",
        "PICKLE", "PULSES", "BISCUIT", "EDIBLE"
    }
    descriptor_words = {
        "REFINED", "TONED", "FULL", "CREAM", "LOW", "FAT", "INSTANT",
        "PREMIUM", "WHOLE", "WHEAT", "MULTIGRAIN", "CASHEW", "ALMOND",
        "MANGO", "ORANGE", "LEMON", "TOMATO", "ONION", "GARLIC",
        "ROASTED", "SALTED", "UNSALTED", "HOMOGENISED", "HOMOGENIZED",
        "PLAIN", "CLASSIC", "ORIGINAL", "FRUIT", "VEGETABLE", "SUNFLOWER",
        "GROUNDNUT", "MUSTARD", "SOYABEAN", "SOYBEAN"
    }
    slogan_words = {
        "RICH", "TASTE", "TASTY", "HEALTHY", "LIGHT", "HEART", "FRIENDLY",
        "PURE", "FRESH", "WITH", "VITAMINS", "MINERALS", "QUALITY",
        "PREMIUM", "DELICIOUS", "GOODNESS", "YUMMY", "BEST", "CHOICE"
    }

    category_hits = sum(1 for w in words if w.upper() in category_words)
    descriptor_hits = sum(1 for w in words if w.upper() in descriptor_words)
    slogan_hits = sum(1 for w in words if w.upper() in slogan_words)

    score = min(len(words), 6) * 7
    if 5 <= len(value) <= 70:
        score += 10
    score += category_hits * 40
    score += descriptor_hits * 7
    score -= slogan_hits * 10

    # Company/legal text is not a commodity name.
    legal_words = {"LIMITED", "LTD", "PRIVATE", "PVT", "LLP", "CORPORATION", "CORP", "COMPANY"}
    score -= sum(20 for w in words if w.upper() in legal_words)

    return score


def _clean_product_candidate(value):
    value = clean_line(str(value or ""))
    value = re.split(
        r"\b(?:NET\s+(?:WEIGHT|WT|QUANTITY|QTY)|M\.?R\.?P\.?|"
        r"BATCH(?:\s+(?:NO|NUMBER))?|LOT(?:\s+(?:NO|NUMBER))?|"
        r"DATE\s+OF\s+(?:PACKING|PACKAGING|MANUFACTURE|MANUFACTURING)|"
        r"USE\s*BY|BEST\s*BEFORE|FSSAI|MANUFACTURED\s+BY|"
        r"PACKED\s+BY|MARKETED\s+BY|CUSTOMER\s+CARE)\b",
        value, maxsplit=1, flags=re.IGNORECASE
    )[0]
    value = re.sub(r"^[\s:;,.|\-_=]+", "", value)
    value = re.sub(r"[\s:;,.|\-_=]+$", "", value)
    return clean_spaces(value)


def _is_valid_product_candidate(value, explicit=False):
    if not value or not (3 <= len(value) <= 100):
        return False
    upper = value.upper()
    forbidden = [
        "MRP", "BATCH", "PKD", "MFD", "MFG", "FSSAI", "LIC", "EXPIRY",
        "USE BY", "BEST BEFORE", "NET WEIGHT", "NET QUANTITY", "MANUFACTURED BY",
        "MANUFACTURER", "PACKED BY", "MARKETED BY", "INGREDIENT", "NUTRITION",
        "CUSTOMER CARE", "CONSUMER CARE", "TOLL FREE", "INCLUSIVE OF ALL TAXES"
    ]
    if any(x in upper for x in forbidden):
        return False
    if "@" in value or re.search(r"\b(?:HTTP|HTTPS|WWW)\b", upper):
        return False
    if re.search(r"\b\d{6}\b", value):
        return False
    if len(re.findall(r"[A-Za-z]", value)) < 4:
        return False
    if len(re.findall(r"\d", value)) > 2:
        return False
    if re.search(r"\b(?:ROAD|STREET|LANE|NAGAR|COLONY|INDIA|GUJARAT|ANDHRA|TELANGANA|DELHI|MUMBAI|CHENNAI|HYDERABAD|AHMEDABAD|GUNTUR)\b", upper):
        return False
    return True


def extract_product_name(text):
    """Conservative generic product-name extraction.

    The previous extractor could select a random OCR line and label it as the
    product. This version returns NOT_FOUND unless there is sufficient product
    evidence. It does not use a brand/product database and does not invent a
    name when the package information is unreadable.
    """
    raw_text = str(text or "")
    lines = [clean_line(x) for x in text_lines(raw_text) if clean_line(x)]
    if not lines:
        return not_found()

    # 1. Explicit product labels are trusted, but the extracted value must
    # still pass validation.
    explicit_labels = [
        r"PRODUCT\s*NAME", r"COMMON\s*/?\s*GENERIC\s*NAME",
        r"COMMON\s*NAME", r"COMMODITY", r"DESCRIPTION\s*OF\s*(?:PRODUCT|COMMODITY)"
    ]
    for line in lines:
        for label in explicit_labels:
            m = re.search(label + r"\s*[:\-]?\s*(.+)", line, re.IGNORECASE)
            if m:
                candidate = _clean_product_candidate(m.group(1))
                if _is_valid_product_candidate(candidate, explicit=True):
                    return found(candidate)

    # 2. Only consider short front-of-pack-like spans. Do not simply take the
    # longest OCR line; that was the source of many false product names.
    category_words = {
        "MILK", "COOKIE", "COOKIES", "BISCUIT", "BISCUITS", "OIL", "RICE",
        "FLOUR", "ATTA", "SALT", "SUGAR", "TEA", "COFFEE", "CHOCOLATE",
        "WAFER", "WAFERS", "NOODLES", "PASTA", "SPICE", "SPICES", "MASALA",
        "JUICE", "DRINK", "BEVERAGE", "WATER", "SHAMPOO", "SOAP", "DETERGENT",
        "TOOTHPASTE", "CREAM", "LOTION", "BUTTER", "CHEESE", "PANEER", "GHEE",
        "SNACK", "SNACKS", "NAMKEEN", "BREAD", "CAKE", "CEREAL", "POHA", "DAL",
        "BESAN", "SEMOLINA", "VERMICELLI", "SAUCE", "KETCHUP", "JAM", "HONEY",
        "PICKLE", "PULSES", "EDIBLE"
    }
    candidates = []

    for i, line in enumerate(lines):
        upper = line.upper()
        if re.search(r"\b(?:MRP|BATCH|LOT|FSSAI|PKD|MFD|MFG|USE BY|BEST BEFORE|NET|INGREDIENTS?|NUTRITION|CUSTOMER|MANUFACTURED|PACKED|MARKETED)\b", upper):
            continue
        if re.search(r"\b\d{5,}\b", line) or "@" in line:
            continue
        if re.search(r"\b(?:ROAD|STREET|LANE|NAGAR|COLONY|INDUSTRIAL|PLOT|DISTRICT|PIN|INDIA)\b", upper):
            continue

        # Single line.
        candidate = _clean_product_candidate(line)
        if _is_valid_product_candidate(candidate):
            words = {w.strip(".,()®™").upper() for w in candidate.split()}
            cat = len(words & category_words)
            score = _product_name_candidate_score(candidate)
            candidates.append((score + cat * 8, candidate, cat))

        # Adjacent 2-line span; useful for "Sunlite Refined" + "Sunflower Oil".
        if i + 1 < len(lines):
            nxt = lines[i + 1]
            if not re.search(r"\b(?:MRP|BATCH|LOT|FSSAI|PKD|MFD|MFG|USE BY|BEST BEFORE|NET|INGREDIENTS?|NUTRITION|CUSTOMER|MANUFACTURED|PACKED|MARKETED)\b", nxt.upper()):
                joined = _clean_product_candidate(f"{line} {nxt}")
                if _is_valid_product_candidate(joined):
                    words = {w.strip(".,()®™").upper() for w in joined.split()}
                    cat = len(words & category_words)
                    score = _product_name_candidate_score(joined)
                    candidates.append((score + cat * 8, joined, cat))

    if not candidates:
        return not_found()

    # Require actual commodity evidence. This is the key safety change:
    # random readable OCR such as a company name, slogan, address, or phone
    # number will no longer become the product name.
    candidates = [c for c in candidates if c[2] >= 1]
    if not candidates:
        return not_found()

    candidates.sort(key=lambda x: (x[0], len(x[1])), reverse=True)
    best_score, best_value, category_hits = candidates[0]

    # Conservative threshold. If OCR is too weak/ambiguous, report NOT_FOUND.
    if best_score < 45 or category_hits < 1:
        return not_found()

    # If several candidates are close but disagree, do not guess.
    close = [c for c in candidates if c[0] >= best_score - 5]
    normalized_close = {re.sub(r"\s+", " ", c[1]).upper() for c in close}
    if len(normalized_close) > 2:
        return not_found()

    return found(best_value)


# ============================================================
# FIELD EXTRACTION
# ============================================================

def extract_fields(text):

    text = normalize_text(
        text
    )

    return {

        "mrp":
            extract_mrp(
                text
            ),

        "net_quantity":
            extract_quantity(
                text
            ),

        "batch":
            extract_batch(
                text
            ),

        "fssai":
            extract_fssai(
                text
            ),

        "customer_care":
            extract_customer_care(
                text
            ),

        "manufacturing_date":
            extract_mfd(
                text
            ),

        "expiry_date":
            extract_expiry(
                text
            ),

        "manufacturer_or_marketer":
            extract_manufacturer(
                text
            ),

        "manufacturer_address":
            extract_address(
                text
            ),

        "product_name":
            extract_product_name(
                text
            ),
    }


# ============================================================
# ML FIELD-EXTRACTION INTEGRATION
# ============================================================

def apply_ml_field_fallback(fields, ml_result, min_confidence=0.78):
    """Use ML predictions only when deterministic extraction missed a field.

    Deterministic extraction remains authoritative for values it already
    detected. This keeps the ML layer assistive and explainable.
    """
    enriched = {
        key: dict(value) if isinstance(value, dict) else value
        for key, value in fields.items()
    }

    if not ml_result or not ml_result.get("available"):
        return enriched

    for field_name, prediction in ml_result.get("best", {}).items():
        if field_name not in enriched:
            continue

        confidence = float(prediction.get("confidence", 0.0))
        value = prediction.get("value")

        if (
            enriched[field_name].get("status") != "FOUND"
            and value
            and confidence >= min_confidence
        ):
            enriched[field_name] = {
                "value": str(value).strip(),
                "status": "FOUND",
                "confidence": round(confidence, 4),
                "source": "ML_FIELD_EXTRACTION",
                "evidence": prediction.get("evidence", ""),
            }

    return enriched


def ml_pipeline_status():
    return {
        "enabled": ML_FIELD_EXTRACTION_AVAILABLE,
        "model": ML_MODEL_VERSION,
        "training_examples": (
            ML_FIELD_EXTRACTOR.training_examples
            if ML_FIELD_EXTRACTOR is not None else 0
        ),
        "dataset_source": (
            ML_FIELD_EXTRACTOR.dataset_source
            if ML_FIELD_EXTRACTOR is not None else None
        ),
        "training_accuracy_diagnostic": (
            round(ML_FIELD_EXTRACTOR.training_accuracy, 4)
            if ML_FIELD_EXTRACTOR is not None
            and ML_FIELD_EXTRACTOR.training_accuracy is not None
            else None
        ),
        "role": "OCR text field extraction; not legal-rule validation",
    }


# ============================================================
# FIELD MERGING
# ============================================================

def merge_fields(
    field_list
):

    final = {}

    field_names = [
        "mrp",
        "net_quantity",
        "batch",
        "fssai",
        "customer_care",
        "manufacturing_date",
        "expiry_date",
        "manufacturer_or_marketer",
        "manufacturer_address",
        "product_name",
    ]

    for field_name in field_names:

        values = []

        for fields in field_list:

            field = fields.get(
                field_name,
                {}
            )

            value = field.get(
                "value"
            )

            status = field.get(
                "status"
            )

            if (
                status == "FOUND"
                and
                value
            ):

                values.append(
                    str(value)
                )

        # ----------------------------------------------------
        # Special merge logic.
        # ----------------------------------------------------

        if not values:

            final[field_name] = (
                not_found()
            )

            continue

        # Manufacturer:
        # prefer known company.
        if field_name == "manufacturer_or_marketer":

            known = [
                value
                for value in values
                if value.upper()
                in KNOWN_COMPANIES
            ]

            if known:

                final[field_name] = found(
                    known[0]
                )

                continue

        # Address:
        # choose longest useful address.
        if field_name == "manufacturer_address":

            value = max(
                values,
                key=len
            )

            final[field_name] = found(
                value
            )

            continue

        # Product:
        # choose longest useful product name.
        if field_name == "product_name":

            value = max(
                values,
                key=len
            )

            final[field_name] = found(
                value
            )

            continue

        # Batch:
        # choose first valid batch.
        if field_name == "batch":

            valid = [
                value
                for value in values
                if valid_batch_candidate(
                    value
                )
            ]

            if valid:

                final[field_name] = found(
                    valid[0]
                )

            else:

                final[field_name] = (
                    not_found()
                )

            continue

        # All normal fields.
        final[field_name] = found(
            values[0]
        )

    return final


# ============================================================
# COMPLIANCE HELPERS
# ============================================================

def rule_result(
    rule_id,
    requirement,
    field_name,
    field
):

    value = field.get(
        "value"
    )

    status = field.get(
        "status"
    )

    if status == "FOUND":

        return {
            "rule_id": rule_id,
            "requirement": requirement,
            "field": field_name,
            "status": "PASS",
            "detected_value": value,
            "message":
                "Required declaration was detected."
        }

    return {
        "rule_id": rule_id,
        "requirement": requirement,
        "field": field_name,
        "status": "REVIEW_REQUIRED",
        "detected_value": None,
        "message":
            "Required declaration was not reliably detected by OCR. Visual verification is required."
    }


# ============================================================
# LEGAL METROLOGY RULE ENGINE
# ============================================================

def calculate_compliance(
    fields
):

    rules = []

    # --------------------------------------------------------
    # Legal Metrology (Packaged Commodities) Rules, 2011
    # core declaration checks.
    # --------------------------------------------------------

    rules.append(
        rule_result(
            "LM-PC-01",
            "Name and address of manufacturer / packer / importer",
            "manufacturer_or_marketer",
            fields[
                "manufacturer_or_marketer"
            ]
        )
    )

    rules.append(
        rule_result(
            "LM-PC-02",
            "Common or generic name of the commodity",
            "product_name",
            fields[
                "product_name"
            ]
        )
    )

    rules.append(
        rule_result(
            "LM-PC-03",
            "Net quantity",
            "net_quantity",
            fields[
                "net_quantity"
            ]
        )
    )

    rules.append(
        rule_result(
            "LM-PC-04",
            "Retail sale price / MRP",
            "mrp",
            fields[
                "mrp"
            ]
        )
    )

    rules.append(
        rule_result(
            "LM-PC-05",
            "Month and year of manufacture / pre-packing / import",
            "manufacturing_date",
            fields[
                "manufacturing_date"
            ]
        )
    )

    rules.append(
        rule_result(
            "LM-PC-06",
            "Best before / use by / expiry declaration where applicable",
            "expiry_date",
            fields[
                "expiry_date"
            ]
        )
    )

    # --------------------------------------------------------
    # Additional product-information checks.
    #
    # These are kept separate from the core Rule 6 checks.
    # --------------------------------------------------------

    rules.append(
        rule_result(
            "INFO-01",
            "Batch / lot identification",
            "batch",
            fields[
                "batch"
            ]
        )
    )

    rules.append(
        rule_result(
            "INFO-02",
            "FSSAI / licence number",
            "fssai",
            fields[
                "fssai"
            ]
        )
    )

    rules.append(
        rule_result(
            "INFO-03",
            "Consumer care contact",
            "customer_care",
            fields[
                "customer_care"
            ]
        )
    )

    # --------------------------------------------------------
    # Counts.
    # --------------------------------------------------------

    passed = [
        rule
        for rule in rules
        if rule["status"] == "PASS"
    ]

    failed = [
        rule
        for rule in rules
        if rule["status"] == "FAIL"
    ]

    review = [
        rule
        for rule in rules
        if rule["status"] == "REVIEW_REQUIRED"
    ]

    not_detected = [
        rule
        for rule in rules
        if rule["status"] == "NOT_DETECTED"
    ]

    confirmed_violation_count = len(
        failed
    )

    review_count = len(
        review
    )

    total = len(
        rules
    )

    detection_percentage = (
        round(
            (
                len(passed) +
                len(failed)
            )
            /
            total
            *
            100
        )
        if total
        else 0
    )

    # --------------------------------------------------------
    # Overall status.
    #
    # We don't call a missing OCR field a violation.
    # --------------------------------------------------------

    if confirmed_violation_count > 0:

        overall_status = "FAIL"

    elif review_count > 0:

        overall_status = "REVIEW_REQUIRED"

    else:

        overall_status = "PASS"

    return {

        "status":
            overall_status,

        "overall_status":
            overall_status,

        "framework":
            "Legal Metrology (Packaged Commodities) Rules, 2011",

        "summary":
            (
                "Confirmed declaration failures detected."
                if confirmed_violation_count > 0
                else
                (
                    "Some declarations require visual verification."
                    if review_count > 0
                    else
                    "Detected declarations satisfy the checked requirements."
                )
            ),

        "total_rule_checks":
            total,

        "rules_passed":
            len(passed),

        "passed":
            len(passed),

        "rules_failed":
            len(failed),

        "failed":
            len(failed),

        "rules_not_detected":
            len(not_detected),

        "not_detected":
            len(not_detected),

        "confirmed_violation_count":
            confirmed_violation_count,

        "violations":
            failed,

        "review_required_count":
            review_count,

        "review_required":
            review,

        "detection_percentage":
            detection_percentage,

        "detection_score":
            detection_percentage,

        "rule_results":
            rules
    }


# ============================================================
# IMAGE RESULT
# ============================================================

def empty_image_result():

    return {
        "fields": {
            "mrp": not_found(),
            "net_quantity": not_found(),
            "batch": not_found(),
            "fssai": not_found(),
            "customer_care": not_found(),
            "manufacturing_date": not_found(),
            "expiry_date": not_found(),
            "manufacturer_or_marketer": not_found(),
            "manufacturer_address": not_found(),
            "product_name": not_found(),
        },
        "raw_text": ""
    }


# ============================================================
# SCAN ENDPOINT
# ============================================================

@app.post("/scan")
async def scan_product(
    file1: UploadFile = File(...),
    file2: UploadFile = File(None),
    file3: UploadFile = File(None),
    file4: UploadFile = File(None),
    file5: UploadFile = File(None),
):

    uploaded_files = [
        file1,
        file2,
        file3,
        file4,
        file5
    ]

    uploaded_files = [
        file
        for file in uploaded_files
        if file is not None
    ]

    image_results = []
    field_results = []

    raw_sections = []

    # ========================================================
    # PROCESS EACH IMAGE
    # ========================================================

    for file in uploaded_files:

        try:

            data = await file.read()

            if not data:
                continue

            image = load_image(
                data
            )

            # ========================================================
            # FAST MULTI-OCR + EXISTING METRIYA EXTRACTION
            # ========================================================
            #
            # The previous pipeline ran the expensive orientation-aware
            # run_ocr() FIRST and then ran RapidOCR + PaddleOCR +
            # Tesseract AGAIN.  That duplicated RapidOCR work and could
            # trigger many additional full-image/panel passes.
            #
            # The normal path now runs each OCR engine only once.
            # RapidOCR is used as the primary text source because it is
            # already part of the ensemble.  The legacy orientation-aware
            # OCR is retained only as a fallback for genuinely weak
            # RapidOCR output.
            # ========================================================

            multi_ocr_result = run_multi_ocr_with_consensus(
                image
            )

            ocr_consensus = multi_ocr_result.get(
                "consensus",
                {}
            )

            ocr_engine_results = multi_ocr_result.get(
                "ocr_results",
                {}
            )

            rapid_result = ocr_engine_results.get(
                "rapidocr",
                {}
            )

            raw_text = rapid_result.get(
                "text",
                ""
            ) or ""

            # Only pay for the old orientation/panel OCR strategy when
            # the primary RapidOCR result is clearly too weak for normal
            # METRIYA extraction.  This keeps difficult/rotated images
            # supported without making every scan expensive.
            meaningful_lines = [
                line
                for line in raw_text.splitlines()
                if len(
                    re.sub(
                        r"[^A-Za-z0-9]",
                        "",
                        line
                    )
                ) >= 3
            ]

            rapid_joined = " ".join(
                meaningful_lines
            ).upper()

            ocr_anchors = [
                "MRP",
                "NET",
                "WEIGHT",
                "BATCH",
                "PKD",
                "MFD",
                "MFG",
                "PACKED",
                "USE BY",
                "BEST BEFORE",
                "FSSAI",
                "LIC",
                "MARKETED"
            ]

            anchor_hits = sum(
                1
                for anchor in ocr_anchors
                if anchor in rapid_joined
            )

            rapid_strength = (
                len(meaningful_lines)
                + (anchor_hits * 3)
            )

            if rapid_strength < 18:
                print(
                    "RapidOCR result is weak "
                    f"(score={rapid_strength}); "
                    "running orientation/panel fallback OCR..."
                )

                fallback_text = run_ocr(
                    image
                )

                fallback_lines = [
                    line
                    for line in fallback_text.splitlines()
                    if len(
                        re.sub(
                            r"[^A-Za-z0-9]",
                            "",
                            line
                        )
                    ) >= 3
                ]

                fallback_strength = len(
                    fallback_lines
                )

                if fallback_strength > rapid_strength:
                    raw_text = fallback_text

                    print(
                        "Using fallback OCR result:",
                        fallback_strength
                    )
                else:
                    print(
                        "Keeping RapidOCR result:",
                        rapid_strength
                    )

            # Preserve the existing METRIYA extraction pipeline.
            normalized = normalize_text(
                raw_text
            )

            fields = extract_fields(
                normalized
            )

            # ========================================================
            # ML FIELD EXTRACTION
            # ========================================================
            ml_result = (
                extract_ml_fields(normalized)
                if ML_FIELD_EXTRACTION_AVAILABLE
                else {}
            )

            fields = apply_ml_field_fallback(
                fields,
                ml_result
            )

            field_results.append(
                fields
            )

            image_results.append(
                {
                    "filename":
                        file.filename,

                    "fields":
                        fields,

                    "raw_text":
                        raw_text,

                    "raw_ocr_text":
                        raw_text,

                    "multi_ocr":
                        ocr_engine_results,

                    "ocr_consensus":
                        ocr_consensus,

                    "ml_extraction":
                        ml_result
                }
            )

            raw_sections.append(
                "\n".join(
                    [
                        "=" * 80,
                        f"FILE: {file.filename}",
                        "",
                        raw_text,
                        "=" * 80
                    ]
                )
            )

            # ------------------------------------------------
            # Debug output.
            # ------------------------------------------------

            print()
            print("=" * 80)
            print("RAW OCR TEXT")
            print("=" * 80)
            print(
                f"FILE: {file.filename}"
            )
            print()
            print(
                raw_text
            )

            print()
            print("=" * 80)
            print("IMAGE EXTRACTED FIELDS")
            print("=" * 80)

            for key, value in fields.items():

                print(
                    f"{key}: "
                    f"{value.get('value')} "
                    f"[{value.get('status')}]"
                )

        except Exception as error:

            print(
                "Image processing error:",
                error
            )

            image_results.append(
                {
                    "filename":
                        file.filename,

                    "fields":
                        empty_image_result()["fields"],

                    "raw_text":
                        "",

                    "raw_ocr_text":
                        "",

                    "error":
                        str(error)
                }
            )

    # ========================================================
    # COMBINE OCR FROM ALL IMAGES
    # ========================================================

    combined_text = "\n".join(
        raw_sections
    )

    combined_text = normalize_text(
        combined_text
    )

    # ========================================================
    # FINAL FIELD EXTRACTION
    # ========================================================

    final_fields = merge_fields(
        field_results
    )

    # Final ML pass over the combined OCR text. This can recover a field
    # that was missed independently on each image, but never overwrites a
    # deterministic field already found by METRIYA's existing extractors.
    final_ml_result = (
        extract_ml_fields(combined_text)
        if ML_FIELD_EXTRACTION_AVAILABLE
        else {}
    )

    final_fields = apply_ml_field_fallback(
        final_fields,
        final_ml_result
    )

    # ========================================================
    # IMPORTANT DATE SAFETY
    # ========================================================
    #
    # If both dates accidentally become identical and the OCR
    # only provides one unique date, keep the expiry only if
    # it has direct evidence and remove the manufacturing date.
    #
    # This prevents the previous:
    #
    # MFD     = 19/08/26
    # EXPIRY  = 19/08/26
    #
    # false duplication.
    # ========================================================

    mfd_value = final_fields[
        "manufacturing_date"
    ].get("value")

    expiry_value = final_fields[
        "expiry_date"
    ].get("value")

    all_dates = extract_all_dates(
        combined_text
    )

    unique_dates = unique_preserve(
        [
            item["value"]
            for item in all_dates
        ]
    )

    if (
        mfd_value
        and
        expiry_value
        and
        mfd_value == expiry_value
        and
        len(unique_dates) == 1
    ):

        # If expiry has direct evidence but MFD doesn't,
        # preserve expiry and remove ambiguous MFD.

        expiry_evidence = extract_date_after_label(
            combined_text,
            [
                r"\bUSE\s*BY\b",
                r"\bBEST\s*BEFORE\b",
                r"\bEXPIRY\b",
                r"\bEXP\b"
            ]
        )

        if (
            expiry_evidence.get(
                "status"
            ) == "FOUND"
        ):

            final_fields[
                "expiry_date"
            ] = expiry_evidence

            final_fields[
                "manufacturing_date"
            ] = not_found()

        else:

            final_fields[
                "manufacturing_date"
            ] = not_found()

            final_fields[
                "expiry_date"
            ] = not_found()

    # ========================================================
    # COMPLIANCE
    # ========================================================

    compliance = calculate_compliance(
        final_fields
    )

    # ========================================================
    # FINAL DEBUG
    # ========================================================

    print()
    print("=" * 80)
    print("FINAL EXTRACTED FIELDS")
    print("=" * 80)

    for key, value in final_fields.items():

        print(
            f"{key}: "
            f"{value.get('value')} "
            f"[{value.get('status')}]"
        )

    print()
    print("=" * 80)
    print("COMPLIANCE")
    print("=" * 80)

    print(
        compliance["overall_status"]
    )

    print(
        "Detection:",
        compliance["detection_percentage"],
        "%"
    )

    print(
        "Passed:",
        compliance["rules_passed"]
    )

    print(
        "Review:",
        compliance["review_required_count"]
    )

    print(
        "Confirmed violations:",
        compliance[
            "confirmed_violation_count"
        ]
    )

    # ========================================================
    # RESPONSE
    # ========================================================

    response_payload = {

    "success":
        True,

    "number_of_images":
        len(uploaded_files),

    "fields":
        final_fields,

    # Multi-OCR field-level consensus
    "ocr_consensus":
        [
            image.get(
                "ocr_consensus",
                {}
            )
            for image in image_results
        ],

    "compliance":
        compliance,

    "images":
        image_results,

    "raw_text":
        combined_text,

    "raw_ocr_text":
        combined_text,

    "ml": {
        "pipeline": ml_pipeline_status(),
        "final_extraction": final_ml_result
    }
}

    # Persist every completed scan so the frontend can later use
    # real history and enforcement-dashboard data.
    try:
        inspector_email = os.getenv(
            "LMCC_DEFAULT_INSPECTOR",
            "inspector.sharma@lmcc.gov.in"
        )
        response_payload["scan_id"] = create_scan_record(
            response_payload,
            inspector_email=inspector_email
        )
    except Exception as error:
        # Scanning itself should still succeed if history storage
        # temporarily fails.
        print("Database save error:", error)
        response_payload["scan_id"] = None
        response_payload["database_warning"] = str(error)

    return response_payload


# ============================================================
# MACHINE LEARNING STATUS
# ============================================================

@app.get("/ml/status")
def ml_status():
    return {
        "success": True,
        "ml": ml_pipeline_status()
    }


# ============================================================
# HEALTH CHECK
# ============================================================

@app.get("/health")
def health():

    return {
        "status":
            "ok",

        "service":
            "METRIYA - Legal Metrology Inspection & Compliance System",

        "ocr":
            "RapidOCR",

        "version":
            "6.0"
    }


# ============================================================
# ROOT
# ============================================================

@app.get("/", include_in_schema=False)
def root():
    """Serve the METRIYA web interface from the same FastAPI server."""
    return FileResponse(
        BASE_DIR / "index_METRIYA.html",
        media_type="text/html"
    )


@app.get("/app_METRIYA.js", include_in_schema=False)
def frontend_script():
    """Serve the METRIYA frontend JavaScript."""
    return FileResponse(
        BASE_DIR / "app_METRIYA.js",
        media_type="application/javascript"
    )

# ============================================================
# AUTHENTICATION (PROTOTYPE)
# ============================================================

from pydantic import BaseModel


class LoginRequest(BaseModel):
    email: str
    password: str


@app.post("/auth/login")
def login(request: LoginRequest):
    user = DEMO_USERS.get(request.email)

    if not user or user["password"] != request.password:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password."
        )

    return {
        "success": True,
        "user": {
            "email": request.email,
            "name": user["name"],
            "role": user["role"],
            "zone": user["zone"],
        }
    }


# ============================================================
# SCAN HISTORY
# ============================================================

@app.get("/scans")
def scans(
    limit: int = 50,
    offset: int = 0,
    status: str | None = None
):
    return {
        "success": True,
        "items": list_scan_records(
            limit=limit,
            offset=offset,
            status=status
        )
    }


# ============================================================
# HISTORY COMPATIBILITY ENDPOINTS
# ============================================================
#
# The existing frontend calls /history.
# Keep this alias while the primary backend uses /scans.
# ============================================================

@app.get("/history")
def history(
    limit: int = 200,
    offset: int = 0,
    status: str | None = None
):
    return {
        "success": True,
        "count": len(
            list_scan_records(
                limit=min(max(limit, 1), 200),
                offset=max(offset, 0),
                status=status
            )
        ),
        "history": list_scan_records(
            limit=min(max(limit, 1), 200),
            offset=max(offset, 0),
            status=status
        )
    }


@app.delete("/history")
def clear_history():
    with db_connect() as connection:
        connection.execute(
            "DELETE FROM scans"
        )
        connection.commit()

    return {
        "success": True,
        "message": "Scan history cleared"
    }


@app.get("/scans/{scan_id}")
def scan_details(scan_id: str):
    from fastapi import HTTPException

    record = get_scan_record(scan_id)

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Scan not found."
        )

    return {
        "success": True,
        "scan": record
    }


# ============================================================
# ENFORCEMENT DASHBOARD
# ============================================================

@app.get("/dashboard/stats")
def dashboard_stats():
    return {
        "success": True,
        "stats": get_dashboard_stats()
    }


# ============================================================
# JSON REPORT
# ============================================================

@app.get("/reports/{scan_id}")
def report(scan_id: str):
    from fastapi import HTTPException

    record = get_scan_record(scan_id)

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Scan not found."
        )

    fields = record.get("fields", {})
    compliance = record.get("compliance", {})

    return {
        "success": True,
        "report": {
            "report_id": record["id"],
            "inspection_date": record["created_at"],
            "product_name": (fields.get("product_name") or {}).get("value"),
            "manufacturer": (
                fields.get("manufacturer_or_marketer") or {}
            ).get("value"),
            "manufacturer_address": (
                fields.get("manufacturer_address") or {}
            ).get("value"),
            "net_quantity": (
                fields.get("net_quantity") or {}
            ).get("value"),
            "mrp": (fields.get("mrp") or {}).get("value"),
            "batch": (fields.get("batch") or {}).get("value"),
            "manufacturing_date": (
                fields.get("manufacturing_date") or {}
            ).get("value"),
            "expiry_date": (
                fields.get("expiry_date") or {}
            ).get("value"),
            "fssai": (fields.get("fssai") or {}).get("value"),
            "customer_care": (
                fields.get("customer_care") or {}
            ).get("value"),
            "compliance_status": compliance.get("overall_status"),
            "detection_percentage": compliance.get(
                "detection_percentage", 0
            ),
            "rule_results": compliance.get(
                "rule_results", []
            ),
            "violations": compliance.get(
                "violations", []
            ),
            "review_required": compliance.get(
                "review_required", []
            ),
        }
    }


# ============================================================
# SERVER-SIDE PDF REPORT
# ============================================================

@app.get("/reports/{scan_id}/pdf")
def report_pdf(scan_id: str):
    from fastapi import HTTPException
    from fastapi.responses import Response

    if not REPORTLAB_AVAILABLE:
        raise HTTPException(
            status_code=500,
            detail="ReportLab is not installed. Install reportlab first."
        )

    record = get_scan_record(scan_id)

    if not record:
        raise HTTPException(
            status_code=404,
            detail="Scan not found."
        )

    fields = record.get("fields", {})
    compliance = record.get("compliance", {})

    buffer = io.BytesIO()
    pdf = canvas.Canvas(buffer, pagesize=A4)
    width, height = A4

    y = height - 50

    def line(label, value):
        nonlocal y
        pdf.setFont("Helvetica-Bold", 10)
        pdf.drawString(50, y, label)
        pdf.setFont("Helvetica", 10)
        pdf.drawString(180, y, str(value or "Not detected"))
        y -= 18

        if y < 60:
            pdf.showPage()
            y = height - 50

    pdf.setTitle("METRIYA - Legal Metrology Inspection Report")

    pdf.setFont("Helvetica-Bold", 16)
    pdf.drawString(
        50,
        y,
        "METRIYA - Legal Metrology Inspection Report"
    )
    y -= 30

    line("Report ID", record["id"])
    line("Inspection Date", record["created_at"])
    line("Product", (fields.get("product_name") or {}).get("value"))
    line(
        "Manufacturer",
        (fields.get("manufacturer_or_marketer") or {}).get("value")
    )
    line(
        "Net Quantity",
        (fields.get("net_quantity") or {}).get("value")
    )
    line("MRP", (fields.get("mrp") or {}).get("value"))
    line("Batch", (fields.get("batch") or {}).get("value"))
    line(
        "Manufacturing Date",
        (fields.get("manufacturing_date") or {}).get("value")
    )
    line(
        "Expiry / Use By",
        (fields.get("expiry_date") or {}).get("value")
    )
    line("FSSAI", (fields.get("fssai") or {}).get("value"))
    line(
        "Compliance Status",
        compliance.get("overall_status")
    )
    line(
        "Detection",
        f'{compliance.get("detection_percentage", 0)}%'
    )
    line(
        "Confirmed Violations",
        compliance.get("confirmed_violation_count", 0)
    )
    line(
        "Review Required",
        compliance.get("review_required_count", 0)
    )

    y -= 10
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawString(50, y, "Rule Results")
    y -= 22

    for rule in compliance.get("rule_results", []):
        rule_text = (
            f'{rule.get("rule_id", "")} - '
            f'{rule.get("status", "")} - '
            f'{rule.get("requirement", "")}'
        )

        # Keep lines readable in the prototype PDF.
        for chunk_start in range(0, len(rule_text), 90):
            pdf.setFont("Helvetica", 8)
            pdf.drawString(
                50,
                y,
                rule_text[chunk_start:chunk_start + 90]
            )
            y -= 13

            if y < 50:
                pdf.showPage()
                y = height - 50

    pdf.save()
    buffer.seek(0)

    return Response(
        content=buffer.getvalue(),
        media_type="application/pdf",
        headers={
            "Content-Disposition":
                f'attachment; filename="{scan_id}.pdf"'
        }
    )


# ============================================================
# ONE-CLICK DESKTOP LAUNCH
# ============================================================
# Double-clicking this Python file can start METRIYA without
# requiring the user to type any command in CMD.
# A small launcher script can also call this file with pythonw.
# ============================================================

if __name__ == "__main__":
    import threading
    import time
    import webbrowser
    import urllib.request
    import urllib.error
    import uvicorn

    HOST = os.getenv("METRIYA_HOST", "127.0.0.1")
    PORT = int(os.getenv("METRIYA_PORT", "8000"))
    URL = f"http://{HOST}:{PORT}/"
    HEALTH_URL = f"http://{HOST}:{PORT}/health"

    def open_browser_when_ready():
        # Wait until FastAPI is actually ready instead of guessing a fixed delay.
        for _ in range(60):
            try:
                with urllib.request.urlopen(HEALTH_URL, timeout=1.0) as response:
                    if response.status == 200:
                        webbrowser.open(URL)
                        return
            except (urllib.error.URLError, TimeoutError, OSError):
                pass
            time.sleep(0.5)

        # Fallback: still try to open the local application.
        try:
            webbrowser.open(URL)
        except Exception:
            pass

    threading.Thread(
        target=open_browser_when_ready,
        daemon=True
    ).start()

    uvicorn.run(
        app,
        host=HOST,
        port=PORT,
        log_level="warning"
    )
