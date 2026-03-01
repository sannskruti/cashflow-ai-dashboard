package com.sanskruti.cashflow.cashflow_backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sanskruti.cashflow.cashflow_backend.api.dto.AiInsightsResponse;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class AiFacadeService {

    private final AnalyticsService analyticsService;
    private final AiInsightsService aiInsightsService;
    private final ObjectMapper objectMapper;

    public AiFacadeService(AnalyticsService analyticsService,
                           AiInsightsService aiInsightsService,
                           ObjectMapper objectMapper) {
        this.analyticsService = analyticsService;
        this.aiInsightsService = aiInsightsService;
        this.objectMapper = objectMapper;
    }

    @Cacheable(cacheNames = "aiInsights", key = "#datasetId + ':' + #horizon")
    public AiInsightsResponse explainCached(Long datasetId, int horizon) throws Exception {

        var summary = analyticsService.computeSummary(datasetId);
        var risk = analyticsService.risk(datasetId);
        var drivers = analyticsService.topExpenseDrivers(datasetId, 5);
        var forecast = analyticsService.forecastWeeklyNet(datasetId, horizon);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("datasetId", datasetId);
        payload.put("summary", summary);
        payload.put("risk", risk);
        payload.put("topExpenseDrivers", drivers);
        payload.put("forecastWeeklyNet", forecast);

        String groundedJson = objectMapper.writeValueAsString(payload);
        return aiInsightsService.generateInsights(groundedJson);
    }
}