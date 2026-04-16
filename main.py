"""
Production-ready FastAPI risk-scoring microservice for Georgian entity verification.

This module exposes a single authenticated endpoint that accepts a registry lookup
request, fetches entity data from an in-memory mock scraper output, calculates a
compliance risk score, and returns a structured risk report.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

import uvicorn
from fastapi import Depends, FastAPI, Header, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, UUID4


API_KEY = "geosanct_test_key_123"
POST_2022_CUTOFF = date(2022, 2, 24)


class RiskTier(str, Enum):
    """Discrete compliance risk tier derived from the calculated score."""

    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class VerificationRequest(BaseModel):
    """Incoming request body for an entity verification lookup."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "registry_id": "404852174",
                "client_reference": "case-geo-001",
            }
        }
    )

    registry_id: str = Field(
        ...,
        pattern=r"^\d{9,11}$",
        description="Georgian public registry identifier containing exactly 9 to 11 digits.",
        examples=["404852174", "204559871"],
    )
    client_reference: str = Field(
        ...,
        min_length=1,
        description="Client-side correlation identifier used to track the verification request.",
        examples=["case-geo-001"],
    )


class Shareholder(BaseModel):
    """Normalized shareholder record used in the risk report."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "name": "Nordic Forwarding LLC",
                "ownership_percentage": 100.0,
                "id_number": "CF-998812",
                "is_corporate": True,
            }
        }
    )

    name: str = Field(
        ...,
        min_length=1,
        description="Full legal name of the shareholder.",
        examples=["Giorgi K.", "Nordic Forwarding LLC"],
    )
    ownership_percentage: float = Field(
        ...,
        ge=0.0,
        le=100.0,
        description="Declared ownership percentage held by the shareholder.",
        examples=[100.0, 55.5],
    )
    id_number: str = Field(
        ...,
        min_length=1,
        description="Identification or registration number associated with the shareholder.",
        examples=["01001001010", "CF-998812"],
    )
    is_corporate: bool = Field(
        ...,
        description="Whether the shareholder is a corporate legal entity rather than an individual.",
        examples=[True, False],
    )


class RiskReportResponse(BaseModel):
    """Structured verification response returned by the risk engine."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "transaction_id": "123e4567-e89b-42d3-a456-426614174000",
                "timestamp": "2026-04-16T12:00:00Z",
                "entity_name": "Nordic Forwarding Georgia LLC",
                "registry_id": "404852174",
                "risk_score": 80,
                "risk_tier": "HIGH",
                "shareholders": [
                    {
                        "name": "Nordic Forwarding LLC",
                        "ownership_percentage": 100.0,
                        "id_number": "CF-998812",
                        "is_corporate": True,
                    }
                ],
                "red_flags": [
                    "Post-2022 Registration (Geopolitical Risk Flag)",
                    "Corporate Shareholder Detected: Ultimate Beneficial Owner is opaque",
                ],
            }
        }
    )

    transaction_id: UUID4 = Field(
        ...,
        description="Server-generated transaction identifier for this verification response.",
    )
    timestamp: str = Field(
        ...,
        description="UTC timestamp in ISO 8601 format indicating when the report was generated.",
        examples=["2026-04-16T12:00:00Z"],
    )
    entity_name: str = Field(
        ...,
        description="Registered legal name of the entity.",
        examples=["Nordic Forwarding Georgia LLC"],
    )
    registry_id: str = Field(
        ...,
        description="Registry identifier that was verified.",
        examples=["404852174"],
    )
    risk_score: int = Field(
        ...,
        ge=0,
        le=100,
        description="Calculated risk score on a scale from 0 to 100.",
        examples=[80, 0],
    )
    risk_tier: RiskTier = Field(
        ...,
        description="Risk classification derived from the risk score thresholds.",
    )
    shareholders: list[Shareholder] = Field(
        ...,
        description="Normalized list of shareholders returned from the entity profile.",
    )
    red_flags: list[str] = Field(
        ...,
        description="Human-readable explanations for rules that contributed to the risk score.",
        examples=[
            [
                "Post-2022 Registration (Geopolitical Risk Flag)",
                "Corporate Shareholder Detected: Ultimate Beneficial Owner is opaque",
            ]
        ],
    )


app = FastAPI(
    title="Georgian Corporate Compliance Risk Engine",
    version="1.0.0",
    description=(
        "Asynchronous RegTech microservice that verifies Georgian entities against "
        "mocked registry data and returns a structured compliance risk report."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


MOCK_ENTITY_DATA: dict[str, dict[str, Any]] = {
    "404852174": {
        "entity_name": "Nordic Forwarding Georgia LLC",
        "registry_id": "404852174",
        "registration_date": "2023-08-14",
        "shareholders": [
            {
                "name": "Nordic Forwarding LLC",
                "ownership_percentage": 100.0,
                "id_number": "CF-998812",
                "is_corporate": True,
            }
        ],
    },
    "204559871": {
        "entity_name": "Giorgi Trade Services",
        "registry_id": "204559871",
        "registration_date": "2015-06-03",
        "shareholders": [
            {
                "name": "Giorgi K.",
                "ownership_percentage": 100.0,
                "id_number": "01001001010",
                "is_corporate": False,
            }
        ],
    },
}


async def verify_api_key(x_api_key: str | None = Header(default=None)) -> None:
    """
    Enforce a simple API key header for local testing.

    Raises:
        HTTPException: If the header is missing or does not match the expected key.
    """

    if x_api_key != API_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )


def calculate_risk(entity_data: dict[str, Any]) -> tuple[int, RiskTier, list[str]]:
    """
    Calculate the entity compliance risk score, tier, and triggered red flags.

    Args:
        entity_data: Registry entity payload containing at least a registration date
            and a list of shareholders.

    Returns:
        Tuple of (risk_score, risk_tier, red_flags).
    """

    score = 0
    red_flags: list[str] = []

    registration_date = date.fromisoformat(entity_data["registration_date"])
    if registration_date > POST_2022_CUTOFF:
        score += 35
        red_flags.append("Post-2022 Registration (Geopolitical Risk Flag)")

    corporate_shareholder_detected = False
    for shareholder in entity_data["shareholders"]:
        shareholder_name = str(shareholder["name"])
        normalized_name = shareholder_name.lower()
        if shareholder["is_corporate"] or any(
            keyword in normalized_name for keyword in ("llc", "ltd", "holdings")
        ):
            corporate_shareholder_detected = True
            break

    if corporate_shareholder_detected:
        score += 45
        red_flags.append(
            "Corporate Shareholder Detected: Ultimate Beneficial Owner is opaque"
        )

    score = min(score, 100)

    if score <= 33:
        tier = RiskTier.LOW
    elif score <= 66:
        tier = RiskTier.MEDIUM
    else:
        tier = RiskTier.HIGH

    return score, tier, red_flags


@app.post(
    "/api/v1/verify-entity",
    response_model=RiskReportResponse,
    summary="Verify a Georgian entity and return a risk report",
    tags=["Verification"],
)
async def verify_entity(
    request: VerificationRequest,
    _: None = Depends(verify_api_key),
) -> RiskReportResponse:
    """
    Verify an entity against mock registry data and return a risk-scored report.

    Args:
        request: Verification payload containing the target registry ID and client
            reference metadata.

    Raises:
        HTTPException: If the registry ID is not present in the mock dataset.
    """

    entity_data = MOCK_ENTITY_DATA.get(request.registry_id)
    if entity_data is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Entity with registry_id '{request.registry_id}' not found.",
        )

    risk_score, risk_tier, red_flags = calculate_risk(entity_data)
    shareholders = [
        Shareholder.model_validate(shareholder)
        for shareholder in entity_data["shareholders"]
    ]

    return RiskReportResponse(
        transaction_id=uuid4(),
        timestamp=datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace(
            "+00:00", "Z"
        ),
        entity_name=str(entity_data["entity_name"]),
        registry_id=str(entity_data["registry_id"]),
        risk_score=risk_score,
        risk_tier=risk_tier,
        shareholders=shareholders,
        red_flags=red_flags,
    )


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
