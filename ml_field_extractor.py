import csv
import os
import re
from typing import Dict, List, Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


# =========================================================
# METRIYA ML FIELD EXTRACTOR
# =========================================================

MODEL_NAME = "METRIYA-FIELD-ML-1.0"
MODEL_VERSION = MODEL_NAME

FIELDS = [
    "product_name",
    "manufacturer_or_marketer",
    "manufacturer_address",
    "mrp",
    "net_quantity",
    "batch",
    "fssai",
    "customer_care",
    "manufacturing_date",
    "expiry_date",
    "other",
]


# =========================================================
# BUILT-IN TRAINING DATA
# =========================================================

BOOTSTRAP_DATA = [

    # -----------------------------------------------------
    # PRODUCT NAME
    # -----------------------------------------------------
    ("Basmati Rice", "product_name"),
    ("Fortune Sunflower Oil", "product_name"),
    ("Sunflower Oil", "product_name"),
    ("HOMOGENISED TONED MILK", "product_name"),
    ("Toned Milk", "product_name"),
    ("Toor Dal", "product_name"),
    ("Premium Quality Rice", "product_name"),
    ("Refined Sunflower Oil", "product_name"),

    # -----------------------------------------------------
    # MANUFACTURER / MARKETER
    # -----------------------------------------------------
    (
        "Manufactured by Gujarat Co-operative Milk Marketing Federation Ltd.",
        "manufacturer_or_marketer",
    ),
    (
        "Manufactured & Packed by Adani Wilmar Ltd.",
        "manufacturer_or_marketer",
    ),
    (
        "Manufactured by Amul",
        "manufacturer_or_marketer",
    ),
    (
        "Marketed by Adani Wilmar Ltd.",
        "manufacturer_or_marketer",
    ),
    (
        "Manufactured by ITC Limited",
        "manufacturer_or_marketer",
    ),
    (
        "Packed by Hindustan Unilever Ltd.",
        "manufacturer_or_marketer",
    ),

    # -----------------------------------------------------
    # ADDRESS
    # -----------------------------------------------------
    (
        "Anand - 388001, Gujarat, India",
        "manufacturer_address",
    ),
    (
        "Ahmedabad - 380009, Gujarat, India",
        "manufacturer_address",
    ),
    (
        "Mumbai - 400001, Maharashtra, India",
        "manufacturer_address",
    ),
    (
        "New Delhi - 110001, India",
        "manufacturer_address",
    ),
    (
        "Hyderabad - 500001, Telangana, India",
        "manufacturer_address",
    ),
    (
        "Bengaluru - 560001, Karnataka, India",
        "manufacturer_address",
    ),

    # -----------------------------------------------------
    # MRP
    # -----------------------------------------------------
    ("M.R.P. 68.00", "mrp"),
    ("M.R.P. 160.00", "mrp"),
    ("MRP Rs. 120", "mrp"),
    ("Maximum Retail Price Rs 250", "mrp"),
    ("₹99 inclusive of all taxes", "mrp"),
    ("MRP: 75.00", "mrp"),

    # -----------------------------------------------------
    # NET QUANTITY
    # -----------------------------------------------------
    ("Net Quantity 1L", "net_quantity"),
    ("NET QUANTITY : 1 L (910 g)", "net_quantity"),
    ("Net Qty 500 g", "net_quantity"),
    ("Net Weight 1 kg", "net_quantity"),
    ("Quantity 250 ml", "net_quantity"),
    ("Net Content 2 L", "net_quantity"),

    # -----------------------------------------------------
    # BATCH
    # -----------------------------------------------------
    ("Batch No. M2403", "batch"),
    ("BATCH NO. :F02401", "batch"),
    ("Batch Number ABC123", "batch"),
    ("Lot No. L12345", "batch"),
    ("LOT NUMBER A123", "batch"),
    ("Batch: X9876", "batch"),

    # -----------------------------------------------------
    # FSSAI
    # -----------------------------------------------------
    (
        "FSSAI Lic. No.10012021000071",
        "fssai",
    ),
    (
        "Lic. No. 10013021000661",
        "fssai",
    ),
    (
        "FSSAI License No 12345678901234",
        "fssai",
    ),
    (
        "FSSAI No. 10012345678901",
        "fssai",
    ),

    # -----------------------------------------------------
    # CUSTOMER CARE
    # -----------------------------------------------------
    (
        "Customer Care: 1800 123 456",
        "customer_care",
    ),
    (
        "Consumer Care: 1800-123-4567",
        "customer_care",
    ),
    (
        "Toll Free: 1800 102 0405",
        "customer_care",
    ),
    (
        "care@example.com",
        "customer_care",
    ),
    (
        "support@company.com",
        "customer_care",
    ),
    (
        "Email: care@adaniwilmar.in",
        "customer_care",
    ),

    # -----------------------------------------------------
    # MANUFACTURING DATE
    # -----------------------------------------------------
    (
        "Date of Packaging : 01 MAR 2024",
        "manufacturing_date",
    ),
    (
        "Date of Packing : 12 FEB 2024",
        "manufacturing_date",
    ),
    (
        "Packing Date 15 JAN 2024",
        "manufacturing_date",
    ),
    (
        "Packed Date 20 MAR 2024",
        "manufacturing_date",
    ),
    (
        "Date Packed 01/03/2024",
        "manufacturing_date",
    ),
    (
        "Manufacturing Date 10/02/2024",
        "manufacturing_date",
    ),
    (
        "Date of Manufacture 05 MAY 2024",
        "manufacturing_date",
    ),
    (
        "Manufactured Date 12-02-2024",
        "manufacturing_date",
    ),
    (
        "MFD 01/01/2024",
        "manufacturing_date",
    ),
    (
        "MFG Date 02-02-2024",
        "manufacturing_date",
    ),
    (
        "Packed on 03 MAR 2024",
        "manufacturing_date",
    ),
    (
        "Packed in March 2024",
        "manufacturing_date",
    ),

    # -----------------------------------------------------
    # EXPIRY DATE
    # -----------------------------------------------------
    (
        "Use By 30 MAR 2024",
        "expiry_date",
    ),
    (
        "USE BY :11 AUG 2025",
        "expiry_date",
    ),
    (
        "Expiry Date 12/2027",
        "expiry_date",
    ),
    (
        "Best Before 12 Months",
        "expiry_date",
    ),
    (
        "Expires On 30 SEP 2026",
        "expiry_date",
    ),
    (
        "Expiry 10/2027",
        "expiry_date",
    ),

    # -----------------------------------------------------
    # OTHER
    # -----------------------------------------------------
    (
        "Keep refrigerated",
        "other",
    ),
    (
        "Store in a cool dry place",
        "other",
    ),
    (
        "For external use only",
        "other",
    ),
    (
        "Shake well before use",
        "other",
    ),
]


# =========================================================
# CSV TRAINING DATA
# =========================================================

BASE_DIR = os.path.dirname(
    os.path.abspath(__file__)
)

CSV_PATH = os.path.join(
    BASE_DIR,
    "ml_data",
    "field_training.csv",
)


def load_csv_data() -> List[tuple]:

    rows = []

    if not os.path.exists(CSV_PATH):
        return rows

    try:

        with open(
            CSV_PATH,
            "r",
            encoding="utf-8-sig",
            newline="",
        ) as file:

            reader = csv.DictReader(file)

            for row in reader:

                text = str(
                    row.get("text", "")
                ).strip()

                label = str(
                    row.get("label", "")
                ).strip()

                if (
                    text
                    and label in FIELDS
                ):

                    rows.append(
                        (text, label)
                    )

    except Exception as error:

        print(
            "[ML] CSV loading error:",
            error
        )

    return rows


CSV_DATA = load_csv_data()

TRAINING_DATA = (
    BOOTSTRAP_DATA +
    CSV_DATA
)


# =========================================================
# TRAINING
# =========================================================

texts = [
    item[0]
    for item in TRAINING_DATA
]

labels = [
    item[1]
    for item in TRAINING_DATA
]


vectorizer = TfidfVectorizer(
    analyzer="char_wb",
    ngram_range=(2, 5),
    lowercase=True,
    sublinear_tf=True,
)


X = vectorizer.fit_transform(
    texts
)


model = LogisticRegression(
    max_iter=3000,
    class_weight="balanced",
    random_state=42,
)


model.fit(
    X,
    labels
)


# =========================================================
# CLEANING
# =========================================================

def _clean(
    value: str
) -> str:

    if not value:
        return ""

    value = str(
        value
    ).strip()

    value = value.strip(
        "[]'\""
    )

    value = re.sub(
        r"\s+",
        " ",
        value
    )

    return value.strip()


# =========================================================
# DATE EXTRACTION
# =========================================================

def _date_value(
    text: str
) -> Optional[str]:

    patterns = [

        # 01 MAR 2024
        r"\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b",

        # 01/03/2024
        r"\b\d{1,2}[/-]\d{1,2}[/-]\d{4}\b",

        # 01.03.2024
        r"\b\d{1,2}\.\d{1,2}\.\d{4}\b",

        # 12/2027
        r"\b\d{1,2}[/-]\d{4}\b",

        # March 2024
        r"\b[A-Za-z]{3,9}\s+\d{4}\b",
    ]

    for pattern in patterns:

        match = re.search(
            pattern,
            text,
            re.I
        )

        if match:

            return match.group(
                0
            ).strip()

    return None


# =========================================================
# STRONG REGEX FIELD EXTRACTION
# =========================================================

def _strong_regex_field(
    text: str
):

    t = text.strip()


    # =====================================================
    # MRP
    # =====================================================

    if re.search(
        r"\bM\s*\.?\s*R\s*\.?\s*P\b",
        t,
        re.I
    ):

        match = re.search(
            r"M\s*\.?\s*R\s*\.?\s*P\s*\.?"
            r"\s*(?:[:\-]|\bRs\.?|₹)?"
            r"\s*(\d+(?:\.\d{1,2})?)",
            t,
            re.I
        )

        if match:

            return (
                "mrp",
                match.group(1)
            )


    # =====================================================
    # NET QUANTITY
    # =====================================================

    if re.search(
        r"\bNET\s+(?:QUANTITY|QTY|WEIGHT|CONTENT)\b",
        t,
        re.I
    ):

        match = re.search(
            r"\b(?:NET\s+(?:QUANTITY|QTY|WEIGHT|CONTENT))\b"
            r"\s*[:\-]?\s*"
            r"([0-9]+(?:\.[0-9]+)?\s*"
            r"(?:kg|kgs|g|gm|gms|mg|l|lt|ltr|ml|"
            r"pcs?|pieces?)"
            r"(?:\s*\([^)]+\))?)",
            t,
            re.I
        )

        if match:

            return (
                "net_quantity",
                match.group(1).strip()
            )


        match = re.search(
            r"\b(?:NET\s+(?:QUANTITY|QTY|WEIGHT|CONTENT))\b"
            r"\s*[:\-]?\s*"
            r"([0-9]+(?:\.[0-9]+)?)",
            t,
            re.I
        )

        if match:

            return (
                "net_quantity",
                match.group(1)
            )


    # =====================================================
    # BATCH / LOT
    # =====================================================

    if re.search(
        r"\b(?:BATCH|LOT)\b",
        t,
        re.I
    ):

        match = re.search(
            r"\b(?:BATCH|LOT)\b"
            r"(?:\s*(?:NO|NUMBER|NUM)\s*\.?)?"
            r"\s*[:#\-]?\s*"
            r"([A-Z0-9][A-Z0-9./_-]{2,})",
            t,
            re.I
        )

        if match:

            value = match.group(
                1
            ).strip()

            if value.upper() not in {
                "NO",
                "NO.",
                "NUMBER",
                "NUM",
            }:

                return (
                    "batch",
                    value
                )


    # =====================================================
    # FSSAI
    # =====================================================

    if re.search(
        r"\bFSSAI\b",
        t,
        re.I
    ):

        match = re.search(
            r"\b\d{14}\b",
            t
        )

        if match:

            return (
                "fssai",
                match.group(0)
            )


    # Lic. No. + 14 digits

    match = re.search(
        r"\bLic\.?\s*"
        r"(?:No\.?|Number)?"
        r"\s*[:.]?\s*"
        r"(\d{14})\b",
        t,
        re.I
    )

    if match:

        return (
            "fssai",
            match.group(1)
        )


    # =====================================================
    # CUSTOMER CARE EMAIL
    # =====================================================

    email = re.search(
        r"\b[A-Za-z0-9._%+-]+"
        r"@[A-Za-z0-9.-]+\."
        r"[A-Za-z]{2,}\b",
        t,
        re.I
    )

    if email:

        return (
            "customer_care",
            email.group(0)
        )


    # =====================================================
    # CUSTOMER CARE PHONE
    # =====================================================

    if re.search(
        r"(customer\s*care|"
        r"consumer\s*care|"
        r"customer\s*service|"
        r"consumer\s*service|"
        r"toll\s*free|"
        r"helpline|"
        r"help\s*line|"
        r"contact)",
        t,
        re.I
    ):

        match = re.search(
            r"(?:\+91[\s-]?)?"
            r"(?:\d[\s-]?){10,12}",
            t
        )

        if match:

            digits = re.sub(
                r"\D",
                "",
                match.group(0)
            )

            if len(digits) >= 10:

                return (
                    "customer_care",
                    digits[-10:]
                )


    # =====================================================
    # MANUFACTURING / PACKING DATE
    # =====================================================

    if re.search(
        r"(date\s+of\s+packaging|"
        r"date\s+of\s+packing|"
        r"packing\s+date|"
        r"packed\s+date|"
        r"date\s+packed|"
        r"manufacturing\s+date|"
        r"date\s+of\s+manufacture|"
        r"manufactured\s+date|"
        r"\bmfd\b|"
        r"mfg\s+date|"
        r"packed\s+on|"
        r"packed\s+in)",
        t,
        re.I
    ):

        value = _date_value(
            t
        )

        if value:

            return (
                "manufacturing_date",
                value
            )


    # =====================================================
    # EXPIRY DATE
    # =====================================================

    if re.search(
        r"(use\s*by|"
        r"expiry|"
        r"expires?|"
        r"best\s+before)",
        t,
        re.I
    ):

        value = _date_value(
            t
        )

        if value:

            return (
                "expiry_date",
                value
            )


    # =====================================================
    # MANUFACTURER / MARKETER
    # =====================================================

    if re.search(
        r"\bmanufactured\b|"
        r"\bmanufacturer\b|"
        r"\bmarketed\s+by\b|"
        r"\bpacked\s+by\b",
        t,
        re.I
    ):

        match = re.search(
            r"(?:manufactured"
            r"(?:\s*&\s*packed)?\s+by|"
            r"marketed\s+by|"
            r"packed\s+by)"
            r"\s*[:\-]?\s*(.+)$",
            t,
            re.I
        )

        if match:

            value = _clean(
                match.group(1)
            )

            if value:

                return (
                    "manufacturer_or_marketer",
                    value
                )


    # =====================================================
    # ADDRESS
    # =====================================================

    if re.search(
        r"\b\d{6}\b",
        t
    ):

        if re.search(
            r"\b(?:india|"
            r"gujarat|"
            r"andhra|"
            r"telangana|"
            r"maharashtra|"
            r"karnataka|"
            r"tamil|"
            r"delhi|"
            r"kerala)\b",
            t,
            re.I
        ):

            return (
                "manufacturer_address",
                t
            )


    return None, None


# =========================================================
# PRODUCT NAME
# =========================================================

def _product_name_candidate(
    text: str
) -> Optional[str]:

    t = _clean(
        text
    )

    if not t:
        return None


    blocked = [

        "mrp",
        "net quantity",
        "net qty",
        "net weight",
        "net content",
        "batch",
        "lot",
        "fssai",
        "lic.",
        "license",
        "use by",
        "expiry",
        "best before",
        "manufactured",
        "manufacturer",
        "marketed",
        "packed by",
        "customer care",
        "consumer care",
        "toll free",
        "email",
        "date of",
        "mfd",
        "mfg",
        "keep refrigerated",
        "store in",
    ]


    lower = t.lower()


    if any(
        item in lower
        for item in blocked
    ):
        return None


    if "@" in t:
        return None


    if re.fullmatch(
        r"[\d\s.,:/-]+",
        t
    ):
        return None


    if re.search(
        r"\b\d{6}\b",
        t
    ):
        return None


    words = t.split()


    if (
        1 <= len(words) <= 8
        and len(t) >= 4
    ):

        return t


    return None


# =========================================================
# PREDICT LINES
# =========================================================

def predict_lines(
    lines: List[str]
) -> List[Dict]:

    results = []


    for line in lines:

        if not line:
            continue


        text = str(
            line
        ).strip()


        if not text:
            continue


        # -------------------------------------------------
        # STRONG REGEX EXTRACTION
        # -------------------------------------------------

        field, value = _strong_regex_field(
            text
        )


        if field and value:

            results.append({

                "field":
                    field,

                "value":
                    _clean(value),

                "confidence":
                    0.90,

                "evidence":
                    [text],

                "source":
                    "ml_text_classifier",

            })

            continue


        # -------------------------------------------------
        # PRODUCT NAME
        # -------------------------------------------------

        product = _product_name_candidate(
            text
        )


        if product:

            X_line = vectorizer.transform(
                [text]
            )


            probabilities = (
                model.predict_proba(
                    X_line
                )[0]
            )


            classes = (
                model.classes_
            )


            best_index = (
                probabilities.argmax()
            )


            predicted_class = (
                classes[best_index]
            )


            ml_confidence = float(
                probabilities[
                    best_index
                ]
            )


            if (
                predicted_class
                == "product_name"
                or
                ml_confidence < 0.60
            ):

                results.append({

                    "field":
                        "product_name",

                    "value":
                        product,

                    "confidence":
                        max(
                            0.75,
                            ml_confidence
                        ),

                    "evidence":
                        [text],

                    "source":
                        "ml_text_classifier",

                })

                continue


        # -------------------------------------------------
        # NORMAL ML CLASSIFICATION
        # -------------------------------------------------

        X_line = vectorizer.transform(
            [text]
        )


        probabilities = (
            model.predict_proba(
                X_line
            )[0]
        )


        classes = (
            model.classes_
        )


        best_index = (
            probabilities.argmax()
        )


        predicted_class = (
            classes[best_index]
        )


        confidence = float(
            probabilities[
                best_index
            ]
        )


        if (
            confidence >= 0.60
            and
            predicted_class != "other"
        ):

            results.append({

                "field":
                    predicted_class,

                "value":
                    _clean(text),

                "confidence":
                    confidence,

                "evidence":
                    [text],

                "source":
                    "ml_text_classifier",

            })


    return results


# =========================================================
# MAIN EXTRACTION
# =========================================================

def extract(
    lines: List[str]
) -> Dict:

    predictions = predict_lines(
        lines
    )


    best = {}


    for prediction in predictions:

        field = prediction[
            "field"
        ]


        if field not in best:

            best[field] = prediction

            continue


        if (
            prediction[
                "confidence"
            ]
            >
            best[field][
                "confidence"
            ]
        ):

            best[field] = prediction


    return {

        "model":
            MODEL_NAME,

        "available":
            True,

        "training_examples":
            len(
                TRAINING_DATA
            ),

        "dataset_source":
            CSV_PATH,

        "training_accuracy":
            float(
                model.score(
                    X,
                    labels
                )
            ),

        "predictions":
            predictions,

        "best":
            best,

    }


# =========================================================
# BACKEND COMPATIBILITY CLASS
# =========================================================

class MLFieldExtractor:

    def __init__(
        self
    ):

        self.available = True

        self.model = model

        self.training_examples = (
            len(
                TRAINING_DATA
            )
        )

        self.dataset_source = (
            CSV_PATH
        )

        self.training_accuracy = float(
            model.score(
                X,
                labels
            )
        )


    def predict_lines(
        self,
        lines
    ):

        return predict_lines(
            lines
        )


    def extract(
        self,
        lines
    ):

        return extract(
            lines
        )


ML_FIELD_EXTRACTOR = (
    MLFieldExtractor()
)


# =========================================================
# MAIN.PY COMPATIBILITY FUNCTION
# =========================================================

def extract_ml_fields(
    text
):

    """
    Adapter used by METRIYA main.py.

    main.py sends OCR text as a string.
    This function converts that text into OCR lines
    and sends them to the ML field extractor.
    """

    if text is None:

        return {

            "model":
                MODEL_NAME,

            "available":
                True,

            "training_examples":
                len(
                    TRAINING_DATA
                ),

            "dataset_source":
                CSV_PATH,

            "training_accuracy":
                float(
                    model.score(
                        X,
                        labels
                    )
                ),

            "predictions":
                [],

            "best":
                {},

        }


    # -----------------------------------------------------
    # If main.py gives a string
    # -----------------------------------------------------

    if isinstance(
        text,
        str
    ):

        lines = [

            line.strip()

            for line
            in text.splitlines()

            if line.strip()

        ]


    # -----------------------------------------------------
    # If a list is supplied
    # -----------------------------------------------------

    else:

        lines = list(
            text
        )


    return extract(
        lines
    )


# =========================================================
# ML STATUS
# =========================================================

def ml_pipeline_status():

    return {

        "enabled":
            True,

        "model":
            MODEL_NAME,

        "training_examples":
            len(
                TRAINING_DATA
            ),

        "dataset_source":
            CSV_PATH,

        "training_accuracy_diagnostic":
            float(
                model.score(
                    X,
                    labels
                )
            ),

        "role":
            "OCR text field extraction; "
            "not legal-rule validation",

    }


# =========================================================
# STARTUP INFORMATION
# =========================================================

print()
print("=" * 70)
print("METRIYA ML FIELD EXTRACTOR")
print("=" * 70)
print(
    "Model              :",
    MODEL_NAME
)
print(
    "Bootstrap examples :",
    len(
        BOOTSTRAP_DATA
    )
)
print(
    "CSV examples       :",
    len(
        CSV_DATA
    )
)
print(
    "Total examples     :",
    len(
        TRAINING_DATA
    )
)
print(
    "Training accuracy   :",
    f"{model.score(X, labels) * 100:.2f}%"
)
print(
    "Dataset             :",
    CSV_PATH
)
print(
    "Role                :",
    "OCR field extraction"
)
print("=" * 70)
print()