package com.sanskruti.cashflow.cashflow_backend.api.dto;

public record ForecastPoint(
        String weekStart,
        double projectedNet
) {}
