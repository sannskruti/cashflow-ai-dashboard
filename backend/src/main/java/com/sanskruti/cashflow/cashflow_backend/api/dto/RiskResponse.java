package com.sanskruti.cashflow.cashflow_backend.api.dto;
import java.util.List;
public record RiskResponse(
        Long datasetId,
        int riskScore,                 // 0-100
        double negativeWeeksRatio,     // 0-1
        double weeklyNetVolatility,    // std dev
        List<String> reasons,
        List<DriverPoint> topExpenseDrivers
) {}