package com.sanskruti.cashflow.cashflow_backend.api.dto;

import java.util.List;

public record AiInsightsResponse(
        String executiveSummary,
        List<String> keyDrivers,
        List<Recommendation> recommendations,
        double confidence,
        List<String> notes
) {
    public record Recommendation(String action, String impact, String effort, String timeframe) {}
}